import { createHash } from "node:crypto";
import { round2 } from "./scoring";
import { RubricSchema, type Rubric, type RubricIssue, type RubricQuestion } from "./types";

export function newId(prefix = ""): string {
  return prefix + crypto.randomUUID().replace(/-/g, "").slice(0, 16);
}

/** Effective maximum of a question: sum of its criteria when criteria exist. */
export function questionMax(q: RubricQuestion): number {
  if (q.criteria.length > 0) return round2(q.criteria.reduce((s, c) => s + c.maxPoints, 0));
  return round2(q.maxPoints);
}

export function rubricTotal(rubric: Rubric): number {
  return round2(rubric.questions.reduce((s, q) => s + questionMax(q), 0));
}

/**
 * Parses and normalizes a rubric coming from the client or from the AI:
 * ensures ids exist, trims strings, and keeps question max in sync with criteria.
 */
export function normalizeRubric(input: unknown): Rubric {
  const rubric = RubricSchema.parse(input);
  const seen = new Set<string>();
  rubric.questions = rubric.questions.map((q) => {
    let id = q.id?.trim() || newId("q_");
    if (seen.has(id)) id = newId("q_");
    seen.add(id);
    const criteria = q.criteria.map((c) => ({
      ...c,
      id: c.id?.trim() || newId("c_"),
      name: c.name.trim(),
      maxPoints: round2(Math.max(0, c.maxPoints)),
    }));
    const next: RubricQuestion = {
      ...q,
      id,
      number: q.number.trim(),
      criteria,
      acceptableAlternatives: q.acceptableAlternatives.map((a) => a.trim()).filter(Boolean),
      maxPoints: round2(Math.max(0, q.maxPoints)),
    };
    next.maxPoints = questionMax(next);
    return next;
  });
  return rubric;
}

/** Deterministic checks that must pass (errors) or should be reviewed (warnings) before locking. */
export function validateRubric(rubric: Rubric | null, maxScore: number): RubricIssue[] {
  const issues: RubricIssue[] = [];
  const err = (message: string, questionNumber: string | null = null) =>
    issues.push({ severity: "error", questionNumber, message, source: "system" });
  const warn = (message: string, questionNumber: string | null = null) =>
    issues.push({ severity: "warning", questionNumber, message, source: "system" });

  if (!rubric || rubric.questions.length === 0) {
    err("המחוון ריק — יש להוסיף לפחות שאלה אחת.");
    return issues;
  }

  const numbers = new Map<string, number>();
  for (const q of rubric.questions) {
    const label = q.number || "?";
    if (!q.number) err("לשאלה חסר מספר.", null);
    numbers.set(q.number, (numbers.get(q.number) ?? 0) + 1);
    if (!(questionMax(q) > 0)) err(`לשאלה ${label} אין ניקוד מקסימלי חיובי.`, q.number);
    if (!q.expectedAnswer.trim() && q.criteria.length === 0 && !q.partialCreditRules.trim()) {
      warn(`לשאלה ${label} אין תשובה צפויה או קריטריונים — ה-AI יסמן אותה לבדיקה ידנית.`, q.number);
    }
    for (const c of q.criteria) {
      if (!c.name) err(`בשאלה ${label} יש קריטריון ללא שם.`, q.number);
    }
  }
  for (const [num, count] of numbers) {
    if (num && count > 1) err(`מספר השאלה "${num}" מופיע ${count} פעמים.`, num);
  }

  const total = rubricTotal(rubric);
  if (Math.abs(total - maxScore) > 0.001) {
    err(`סכום הניקוד במחוון (${total}) שונה מהציון המקסימלי של המבחן (${maxScore}).`);
  }
  return issues;
}

export function hasBlockingIssues(issues: RubricIssue[]): boolean {
  return issues.some((i) => i.severity === "error");
}

/** Stable hash of the rubric + settings that affect grading; used to prove every student got the same criteria. */
export function rubricHash(rubric: Rubric, gradingContext: Record<string, unknown>): string {
  return createHash("sha256")
    .update(stableStringify({ rubric, gradingContext }))
    .digest("hex")
    .slice(0, 24);
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return "[" + value.map(stableStringify).join(",") + "]";
  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    return (
      "{" +
      Object.keys(obj)
        .sort()
        .map((k) => JSON.stringify(k) + ":" + stableStringify(obj[k]))
        .join(",") +
      "}"
    );
  }
  return JSON.stringify(value);
}
