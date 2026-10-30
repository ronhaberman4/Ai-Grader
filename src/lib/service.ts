// Application services: every workflow step goes through here (API routes stay thin).
import { getModelClient } from "./ai";
import { GradingOutputSchema, InsightsOutputSchema, RubricExtractionSchema } from "./ai-schemas";
import { computeClassStats } from "./analytics";
import * as db from "./db";
import { fileToParts, type InputPart } from "./extract";
import {
  GRADING_USER_PREAMBLE,
  gradingContextForHash,
  gradingInstructions,
  insightsInput,
  insightsInstructions,
  rubricExtractionInstructions,
} from "./prompts";
import { createQueue, type Queue } from "./queue";
import { hasBlockingIssues, newId, normalizeRubric, rubricHash, validateRubric } from "./rubric";
import {
  applyReviewAction,
  buildOverall,
  buildResults,
  computeTotals,
  deriveStatus,
  mergeRegrade,
  type ReviewAction,
} from "./scoring";
import type { GradingSession, OverallFeedback, Rubric, RubricIssue, SessionSettings, Submission } from "./types";

export class ServiceError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

export function mustGetSession(id: string): GradingSession {
  const s = db.getSession(id);
  if (!s) throw new ServiceError("מבחן לא נמצא", 404);
  return s;
}

export function mustGetSubmission(id: string): Submission {
  const s = db.getSubmission(id);
  if (!s) throw new ServiceError("עבודה לא נמצאה", 404);
  return s;
}

// ---------------- Settings ----------------

export function updateSettings(id: string, settings: SessionSettings) {
  const s = mustGetSession(id);
  if (s.rubricLockedAt) {
    const gradingChanged = (Object.keys(gradingContextForHash(s)) as (keyof SessionSettings)[]).some(
      (k) => settings[k] !== s[k],
    );
    if (gradingChanged) {
      throw new ServiceError("המחוון נעול — לא ניתן לשנות הגדרות בדיקה. ניתן לשנות רק את שם המבחן והכיתה.");
    }
    db.updateSessionLabels(id, settings.name, settings.className);
    return;
  }
  db.updateSessionSettings(id, settings);
  // Re-check the rubric against the (possibly new) max score.
  if (s.rubric) db.saveRubric(id, s.rubric, mergeIssues(s.rubricIssues, validateRubric(s.rubric, settings.maxScore)));
}

// ---------------- Rubric ----------------

function mergeIssues(previous: RubricIssue[], system: RubricIssue[]): RubricIssue[] {
  return [...system, ...previous.filter((i) => i.source === "ai")];
}

function assertUnlocked(s: GradingSession) {
  if (s.rubricLockedAt) throw new ServiceError("המחוון נעול ולא ניתן לשנות אותו.", 409);
}

export async function extractRubric(sessionId: string, pastedText: string): Promise<GradingSession> {
  const s = mustGetSession(sessionId);
  assertUnlocked(s);
  const files = db.listSessionFiles(sessionId);
  const labels = { exam: "EXAM", answer_key: "ANSWER KEY", rubric: "GRADING RUBRIC" } as const;
  const input: InputPart[] = [];
  for (const kind of ["exam", "answer_key", "rubric"] as const) {
    for (const f of files.filter((x) => x.kind === kind)) input.push(...(await fileToParts(f, labels[kind])));
  }
  if (pastedText.trim()) input.push({ type: "text", text: `--- TEACHER'S TYPED GRADING INSTRUCTIONS / RUBRIC ---\n${pastedText.trim()}` });
  if (input.length === 0) throw new ServiceError("יש להעלות קבצים (מבחן / תשובון / מחוון) או להדביק הנחיות בדיקה.");

  const client = getModelClient();
  const out = await client.structured({
    name: "rubric_extraction",
    instructions: rubricExtractionInstructions(s),
    input,
    schema: RubricExtractionSchema,
  });

  const rubric = normalizeRubric({
    questions: out.questions.map((q) => ({
      ...q,
      id: newId("q_"),
      criteria: q.criteria.map((c) => ({ ...c, id: newId("c_") })),
    })),
    generalInstructions: out.generalInstructions,
  });
  const aiIssues: RubricIssue[] = out.issues.map((i) => ({ ...i, source: "ai" }));
  db.saveRubric(sessionId, rubric, [...validateRubric(rubric, s.maxScore), ...aiIssues], pastedText);
  return mustGetSession(sessionId);
}

export function saveRubricEdits(sessionId: string, input: unknown, opts: { dismissAiIssues?: boolean; pastedText?: string } = {}) {
  const s = mustGetSession(sessionId);
  assertUnlocked(s);
  const rubric = normalizeRubric(input);
  const aiIssues = opts.dismissAiIssues ? [] : s.rubricIssues.filter((i) => i.source === "ai");
  db.saveRubric(sessionId, rubric, [...validateRubric(rubric, s.maxScore), ...aiIssues], opts.pastedText);
  return mustGetSession(sessionId);
}

export function lockRubric(sessionId: string) {
  const s = mustGetSession(sessionId);
  assertUnlocked(s);
  const rubric = s.rubric ? normalizeRubric(s.rubric) : null;
  const issues = validateRubric(rubric, s.maxScore);
  if (hasBlockingIssues(issues)) {
    db.saveRubric(sessionId, rubric, mergeIssues(s.rubricIssues, issues));
    throw new ServiceError("לא ניתן לנעול: " + issues.filter((i) => i.severity === "error").map((i) => i.message).join(" "));
  }
  db.saveRubric(sessionId, rubric, mergeIssues(s.rubricIssues, issues));
  db.setRubricLock(sessionId, rubricHash(rubric!, gradingContextForHash(s)));
  return mustGetSession(sessionId);
}

export function unlockRubric(sessionId: string) {
  const s = mustGetSession(sessionId);
  const graded = db.listSubmissions(sessionId).filter((x) => x.results !== null || x.status === "processing");
  if (graded.length > 0) {
    throw new ServiceError(
      `לא ניתן לפתוח את המחוון: ${graded.length} עבודות כבר נבדקו לפיו. כדי לשמור על בדיקה אחידה לכל התלמידים, צרו מבחן חדש (אפשר לשכפל) או מחקו את העבודות שנבדקו.`,
      409,
    );
  }
  db.setRubricLock(s.id, null);
  return mustGetSession(sessionId);
}

/** Creates a copy of a session (settings + rubric, unlocked, without submissions). */
export function duplicateSession(sessionId: string) {
  const s = mustGetSession(sessionId);
  const copy = db.createSession({ ...s, name: s.name + " (עותק)" });
  if (s.rubric) db.saveRubric(copy.id, s.rubric, validateRubric(s.rubric, s.maxScore), s.rubricSourceText);
  return mustGetSession(copy.id);
}

// ---------------- Grading ----------------

const g = globalThis as unknown as { __gradingQueue?: Queue };

export function gradingQueue(): Queue {
  if (!g.__gradingQueue) {
    const concurrency = Math.max(1, Number(process.env.GRADING_CONCURRENCY) || 3);
    g.__gradingQueue = createQueue((id) => runGrading(id), concurrency);
  }
  return g.__gradingQueue;
}

/** For tests: replace the queue instance. */
export function resetQueueForTests() {
  g.__gradingQueue = undefined;
}

const regradeOptions = new Map<string, { overwriteTeacherChanges: boolean }>();

export function requestGrading(submissionId: string, opts: { overwriteTeacherChanges?: boolean } = {}) {
  const sub = mustGetSubmission(submissionId);
  const s = mustGetSession(sub.sessionId);
  if (!s.rubricLockedAt) throw new ServiceError("יש לנעול את המחוון לפני הבדיקה.");
  if (sub.status === "approved") throw new ServiceError("העבודה כבר אושרה. יש לבטל את האישור לפני בדיקה חוזרת.");
  if (sub.files.length === 0) throw new ServiceError("לעבודה אין קבצים.");
  regradeOptions.set(submissionId, { overwriteTeacherChanges: !!opts.overwriteTeacherChanges });
  if (sub.status !== "processing") db.updateSubmission(submissionId, { status: "uploaded", error: null });
  gradingQueue().enqueue(submissionId);
}

/** Puts any submission left in "uploaded" state (e.g. after a restart) back on the queue. */
export function resumePending(sessionId: string) {
  const s = db.getSession(sessionId);
  if (!s?.rubricLockedAt) return;
  for (const sub of db.listSubmissions(sessionId)) {
    if (sub.status === "uploaded" && sub.files.length > 0) gradingQueue().enqueue(sub.id);
  }
}

export async function runGrading(submissionId: string): Promise<void> {
  if (!db.claimSubmission(submissionId)) return;
  const opts = regradeOptions.get(submissionId) ?? { overwriteTeacherChanges: false };
  regradeOptions.delete(submissionId);
  try {
    const sub = mustGetSubmission(submissionId);
    const s = mustGetSession(sub.sessionId);
    if (!s.rubricLockedAt || !s.rubric || !s.rubricHash) throw new ServiceError("המחוון אינו נעול.");
    const rubric = s.rubric;

    const input: InputPart[] = [{ type: "text", text: GRADING_USER_PREAMBLE }];
    for (const [i, f] of sub.files.entries()) input.push(...(await fileToParts(f, `STUDENT FILE ${i + 1} of ${sub.files.length}`)));

    const client = getModelClient();
    const output = await client.structured({
      name: "grading_result",
      instructions: gradingInstructions(s, rubric),
      input,
      schema: GradingOutputSchema,
    });

    const { results: fresh, warnings } = buildResults(rubric, output, s.feedbackLanguage);
    const latest = mustGetSubmission(submissionId); // teacher may have edited meanwhile
    const results = mergeRegrade(latest.results, fresh, opts.overwriteTeacherChanges);
    const totals = computeTotals(rubric, results, s.maxScore);
    const detected = output.detectedStudentName?.trim() || null;

    db.updateSubmission(submissionId, {
      results,
      overall: buildOverall(output, s.feedbackLanguage),
      teacherOverall: opts.overwriteTeacherChanges ? null : latest.teacherOverall,
      detectedName: detected,
      ...(latest.nameSource === "none" && detected ? { studentName: detected, nameSource: "document" as const } : {}),
      status: deriveStatus(rubric, results, s.maxScore),
      error: [...warnings, ...output.rubricConcerns.map((c) => "הערה על המחוון: " + c)].join("\n") || null,
      rubricHash: s.rubricHash,
      aiModel: client.model,
      aiTotal: totals.aiTotal,
      gradedAt: new Date().toISOString(),
    });
    db.touchSession(s.id);
  } catch (e) {
    console.error("[grading] failed", submissionId, e);
    db.updateSubmission(submissionId, {
      status: "failed",
      error: e instanceof Error ? e.message : "שגיאה לא ידועה",
    });
  }
}

// ---------------- Teacher review ----------------

export function reviewQuestion(submissionId: string, questionId: string, action: ReviewAction) {
  const sub = mustGetSubmission(submissionId);
  if (sub.status === "approved") throw new ServiceError("העבודה מאושרת. בטלו את האישור כדי לערוך.", 409);
  if (!sub.results) throw new ServiceError("העבודה עוד לא נבדקה.");
  const s = mustGetSession(sub.sessionId);
  const q = s.rubric!.questions.find((x) => x.id === questionId);
  const idx = sub.results.findIndex((r) => r.questionId === questionId);
  if (!q || idx < 0) throw new ServiceError("שאלה לא נמצאה", 404);
  const results = [...sub.results];
  try {
    results[idx] = applyReviewAction(results[idx], q, action);
  } catch (e) {
    throw new ServiceError(e instanceof Error ? e.message : String(e));
  }
  db.updateSubmission(submissionId, { results, status: deriveStatus(s.rubric!, results, s.maxScore) });
  return mustGetSubmission(submissionId);
}

export function acceptAllConfident(submissionId: string) {
  const sub = mustGetSubmission(submissionId);
  if (sub.status === "approved" || !sub.results) throw new ServiceError("לא ניתן לבצע פעולה זו כעת.");
  const s = mustGetSession(sub.sessionId);
  const results = sub.results.map((r) =>
    r.decision === "pending" && !r.needsReview && r.aiPoints !== null ? { ...r, decision: "accepted" as const } : r,
  );
  db.updateSubmission(submissionId, { results, status: deriveStatus(s.rubric!, results, s.maxScore) });
  return mustGetSubmission(submissionId);
}

export function updateSubmissionMeta(
  submissionId: string,
  patch: { studentName?: string; teacherComment?: string; teacherOverall?: OverallFeedback | null },
) {
  const sub = mustGetSubmission(submissionId);
  if (sub.status === "approved" && (patch.teacherOverall !== undefined || patch.teacherComment !== undefined)) {
    throw new ServiceError("העבודה מאושרת. בטלו את האישור כדי לערוך.", 409);
  }
  db.updateSubmission(submissionId, {
    ...(patch.studentName !== undefined ? { studentName: patch.studentName.trim(), nameSource: "manual" as const } : {}),
    ...(patch.teacherComment !== undefined ? { teacherComment: patch.teacherComment } : {}),
    ...(patch.teacherOverall !== undefined ? { teacherOverall: patch.teacherOverall } : {}),
  });
  return mustGetSubmission(submissionId);
}

export function approveSubmission(submissionId: string) {
  const sub = mustGetSubmission(submissionId);
  const s = mustGetSession(sub.sessionId);
  if (!sub.results || !s.rubric) throw new ServiceError("העבודה עוד לא נבדקה.");
  if (sub.rubricHash !== s.rubricHash) {
    throw new ServiceError("העבודה נבדקה לפי גרסה אחרת של המחוון. יש לבדוק אותה מחדש.", 409);
  }
  if (!sub.studentName.trim()) throw new ServiceError("יש להזין את שם התלמיד לפני האישור.");
  const totals = computeTotals(s.rubric, sub.results, s.maxScore);
  if (totals.unresolved > 0) {
    throw new ServiceError(`יש ${totals.unresolved} שאלות שדורשות החלטה שלך לפני האישור.`);
  }
  db.updateSubmission(submissionId, {
    status: "approved",
    finalScore: totals.currentTotal,
    approvedAt: new Date().toISOString(),
  });
  db.setInsights(s.id, null); // class insights are stale now
  return mustGetSubmission(submissionId);
}

export function unapproveSubmission(submissionId: string) {
  const sub = mustGetSubmission(submissionId);
  const s = mustGetSession(sub.sessionId);
  if (sub.status !== "approved") return sub;
  db.updateSubmission(submissionId, {
    status: deriveStatus(s.rubric!, sub.results!, s.maxScore),
    finalScore: null,
    approvedAt: null,
  });
  db.setInsights(s.id, null);
  return mustGetSubmission(submissionId);
}

// ---------------- Class analysis ----------------

export function classStats(sessionId: string) {
  const s = mustGetSession(sessionId);
  if (!s.rubric) throw new ServiceError("אין מחוון למבחן זה.");
  return computeClassStats(s.rubric, s.maxScore, db.listSubmissions(sessionId));
}

export async function generateInsights(sessionId: string) {
  const s = mustGetSession(sessionId);
  const stats = classStats(sessionId);
  if (stats.count < 2) throw new ServiceError("צריך לפחות 2 עבודות מאושרות כדי לנתח את הכיתה.");
  const out = await getModelClient().structured({
    name: "class_insights",
    instructions: insightsInstructions(s),
    input: [{ type: "text", text: insightsInput(stats, s.rubric as Rubric) }],
    schema: InsightsOutputSchema,
  });
  db.setInsights(sessionId, { ...out, basedOnCount: stats.count });
  return mustGetSession(sessionId);
}
