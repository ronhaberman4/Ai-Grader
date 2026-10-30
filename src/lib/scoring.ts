// Deterministic scoring logic. The language model only *suggests* per-question points;
// every total, clamp and status decision is computed here.
import type { GradingOutput } from "./ai-schemas";
import type {
  FeedbackLanguage,
  LocalizedText,
  OverallFeedback,
  QuestionResult,
  Rubric,
  RubricQuestion,
  SubmissionStatus,
} from "./types";

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

function maxOf(q: RubricQuestion): number {
  if (q.criteria.length > 0) return round2(q.criteria.reduce((s, c) => s + c.maxPoints, 0));
  return q.maxPoints;
}

function cleanPoints(value: number | null | undefined, max: number): { points: number | null; clamped: boolean } {
  if (value === null || value === undefined || !Number.isFinite(value)) return { points: null, clamped: false };
  const points = round2(clamp(value, 0, max));
  return { points, clamped: points !== round2(value) };
}

function pickLanguage(text: LocalizedText, lang: FeedbackLanguage): LocalizedText {
  return {
    en: lang === "he" ? null : text.en?.trim() || null,
    he: lang === "en" ? null : text.he?.trim() || null,
  };
}

/**
 * Converts raw (already schema-validated) model output into stored results,
 * aligned 1:1 with the locked rubric. Enforces every grading safeguard:
 * no points above max, no invented answers for unreadable work, missing items flagged.
 */
export function buildResults(
  rubric: Rubric,
  output: GradingOutput,
  lang: FeedbackLanguage,
): { results: QuestionResult[]; warnings: string[] } {
  const warnings: string[] = [];
  const known = new Set(rubric.questions.map((q) => q.id));
  for (const a of output.answers) {
    if (!known.has(a.questionId) && !rubric.questions.some((q) => q.number === a.questionId)) {
      warnings.push(`ה-AI החזיר תשובה לשאלה שאינה במחוון (${a.questionId}) — התעלמנו ממנה.`);
    }
  }

  const results = rubric.questions.map((q): QuestionResult => {
    const max = maxOf(q);
    const a =
      output.answers.find((x) => x.questionId === q.id) ??
      output.answers.find((x) => x.questionId === q.number);

    if (!a) {
      return {
        questionId: q.id,
        studentAnswer: "",
        readability: "not_answered",
        aiPoints: null,
        aiCriteria: q.criteria.map((c) => ({ criterionId: c.id, aiPoints: null, explanation: "" })),
        explanation: "",
        aiFeedback: { en: null, he: null },
        confidence: "low",
        needsReview: true,
        reviewReason: "ה-AI לא החזיר תוצאה לשאלה זו — יש לנקד ידנית.",
        mistakes: [],
        teacherPoints: null,
        teacherCriteria: null,
        teacherFeedback: null,
        decision: "pending",
      };
    }

    const reasons: string[] = [];
    if (a.reviewReason) reasons.push(a.reviewReason);
    let needsReview = a.needsTeacherReview;

    let aiPoints: number | null;
    const aiCriteria = q.criteria.map((c) => {
      const s = a.criteriaScores.find((x) => x.criterionId === c.id || x.criterionId === c.name);
      const { points, clamped } = cleanPoints(s?.points, c.maxPoints);
      if (clamped) reasons.push(`הניקוד שהוצע לקריטריון "${c.name}" חרג מהמותר והוגבל ל-${points}.`);
      return { criterionId: c.id, aiPoints: points, explanation: s?.explanation ?? "" };
    });

    if (q.criteria.length > 0) {
      aiPoints = aiCriteria.some((c) => c.aiPoints === null)
        ? null
        : round2(aiCriteria.reduce((s, c) => s + (c.aiPoints ?? 0), 0));
    } else {
      const { points, clamped } = cleanPoints(a.awardedPoints, max);
      if (clamped) reasons.push(`הניקוד שהוצע (${a.awardedPoints}) חרג מהטווח 0–${max} והוגבל.`);
      aiPoints = points;
    }

    if (a.readability === "unreadable") {
      // Never guess an unreadable answer.
      aiPoints = null;
      for (const c of aiCriteria) c.aiPoints = null;
      needsReview = true;
      reasons.push("התשובה לא קריאה — יש לבדוק בקובץ המקורי.");
    } else if (a.readability === "partially_unclear") {
      needsReview = true;
      if (!a.reviewReason) reasons.push("חלק מהתשובה לא ברור — מומלץ לבדוק בקובץ המקורי.");
    } else if (a.readability === "not_answered" && aiPoints === null && q.criteria.length === 0) {
      aiPoints = 0;
    }

    if (a.confidence === "low") needsReview = true;
    if (aiPoints === null) needsReview = true;

    return {
      questionId: q.id,
      studentAnswer: a.readability === "unreadable" ? a.studentAnswer || "[לא קריא]" : a.studentAnswer,
      readability: a.readability,
      aiPoints,
      aiCriteria,
      explanation: a.explanation,
      aiFeedback: pickLanguage(a.feedback, lang),
      confidence: a.confidence,
      needsReview,
      reviewReason: reasons.length ? Array.from(new Set(reasons)).join(" ") : null,
      mistakes: a.mistakes,
      teacherPoints: null,
      teacherCriteria: null,
      teacherFeedback: null,
      decision: "pending",
    };
  });

  return { results, warnings };
}

export function buildOverall(output: GradingOutput, lang: FeedbackLanguage): OverallFeedback {
  const map = (items: LocalizedText[]) =>
    items.map((t) => pickLanguage(t, lang)).filter((t) => t.en || t.he);
  return {
    strengths: map(output.overall.strengths),
    improvements: map(output.overall.improvements),
    keyMistakes: map(output.overall.keyMistakes),
    recommendations: map(output.overall.recommendations),
  };
}

/**
 * The points that count for a question right now, or null if the teacher still has to decide.
 * Priority: teacher per-criterion scores > teacher points > accepted AI suggestion.
 */
export function finalPoints(r: QuestionResult, q: RubricQuestion): number | null {
  const max = maxOf(q);
  if (r.teacherCriteria && q.criteria.length > 0) {
    let sum = 0;
    for (const c of q.criteria) {
      const v = r.teacherCriteria[c.id] ?? r.aiCriteria.find((x) => x.criterionId === c.id)?.aiPoints;
      if (v === null || v === undefined) return null;
      sum += clamp(v, 0, c.maxPoints);
    }
    return round2(clamp(sum, 0, max));
  }
  if (r.teacherPoints !== null) return round2(clamp(r.teacherPoints, 0, max));
  if (r.decision === "rejected" || r.decision === "manual") return null;
  if (r.needsReview && r.decision !== "accepted") return null;
  return r.aiPoints === null ? null : round2(clamp(r.aiPoints, 0, max));
}

export type Totals = {
  aiTotal: number;
  currentTotal: number;
  unresolved: number;
  maxScore: number;
  percent: number;
  teacherAdjusted: boolean;
};

export function computeTotals(rubric: Rubric, results: QuestionResult[], maxScore: number): Totals {
  let aiTotal = 0;
  let currentTotal = 0;
  let unresolved = 0;
  let teacherAdjusted = false;
  for (const q of rubric.questions) {
    const r = results.find((x) => x.questionId === q.id);
    if (!r) {
      unresolved++;
      continue;
    }
    aiTotal += r.aiPoints ?? 0;
    const f = finalPoints(r, q);
    if (f === null) unresolved++;
    else currentTotal += f;
    if (r.teacherPoints !== null || r.teacherCriteria !== null) teacherAdjusted = true;
  }
  aiTotal = round2(clamp(aiTotal, 0, maxScore));
  currentTotal = round2(clamp(currentTotal, 0, maxScore));
  return {
    aiTotal,
    currentTotal,
    unresolved,
    maxScore,
    percent: maxScore > 0 ? round2((currentTotal / maxScore) * 100) : 0,
    teacherAdjusted,
  };
}

export function deriveStatus(rubric: Rubric, results: QuestionResult[], maxScore: number): SubmissionStatus {
  return computeTotals(rubric, results, maxScore).unresolved > 0 ? "needs_review" : "ready";
}

export type ReviewAction =
  | { type: "set_points"; points: number | null }
  | { type: "set_criterion"; criterionId: string; points: number | null }
  | { type: "accept" }
  | { type: "reject" }
  | { type: "mark_manual" }
  | { type: "reset" }
  | { type: "set_feedback"; feedback: LocalizedText | null };

/** Applies a teacher review action to one question. Pure function. */
export function applyReviewAction(r: QuestionResult, q: RubricQuestion, action: ReviewAction): QuestionResult {
  const next: QuestionResult = { ...r };
  switch (action.type) {
    case "set_points": {
      if (action.points === null) {
        next.teacherPoints = null;
        next.decision = r.decision === "adjusted" ? "pending" : r.decision;
      } else {
        next.teacherPoints = round2(clamp(action.points, 0, maxOf(q)));
        next.teacherCriteria = null;
        next.decision = next.teacherPoints === r.aiPoints ? "accepted" : "adjusted";
      }
      break;
    }
    case "set_criterion": {
      const c = q.criteria.find((x) => x.id === action.criterionId);
      if (!c) throw new Error("קריטריון לא קיים");
      const tc = { ...(r.teacherCriteria ?? {}) };
      if (action.points === null) delete tc[c.id];
      else tc[c.id] = round2(clamp(action.points, 0, c.maxPoints));
      next.teacherCriteria = Object.keys(tc).length ? tc : null;
      next.teacherPoints = null;
      next.decision = next.teacherCriteria ? "adjusted" : "pending";
      break;
    }
    case "accept": {
      if (r.aiPoints === null && !r.teacherCriteria) throw new Error("אין הצעת ניקוד לאשר — יש להזין ניקוד ידנית.");
      next.decision = "accepted";
      break;
    }
    case "reject":
      next.decision = "rejected";
      next.teacherPoints = null;
      next.teacherCriteria = null;
      break;
    case "mark_manual":
      next.decision = "manual";
      next.teacherPoints = null;
      next.teacherCriteria = null;
      break;
    case "reset":
      next.decision = "pending";
      next.teacherPoints = null;
      next.teacherCriteria = null;
      next.teacherFeedback = null;
      break;
    case "set_feedback":
      next.teacherFeedback = action.feedback;
      break;
  }
  return next;
}

/**
 * Merges a fresh AI grading run into existing results.
 * Unless the teacher explicitly allowed overwriting, every teacher decision, score and feedback is preserved.
 */
export function mergeRegrade(
  previous: QuestionResult[] | null,
  fresh: QuestionResult[],
  overwriteTeacherChanges: boolean,
): QuestionResult[] {
  if (!previous || overwriteTeacherChanges) return fresh;
  return fresh.map((f) => {
    const old = previous.find((p) => p.questionId === f.questionId);
    if (!old) return f;
    return {
      ...f,
      teacherPoints: old.teacherPoints,
      teacherCriteria: old.teacherCriteria,
      teacherFeedback: old.teacherFeedback,
      decision: old.decision,
    };
  });
}

export function hasTeacherChanges(results: QuestionResult[] | null): boolean {
  return !!results?.some(
    (r) => r.decision !== "pending" || r.teacherPoints !== null || r.teacherCriteria !== null || r.teacherFeedback !== null,
  );
}

export function effectiveFeedback(r: QuestionResult): LocalizedText {
  return r.teacherFeedback ?? r.aiFeedback;
}
