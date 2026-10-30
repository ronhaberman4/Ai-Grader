import { describe, expect, it } from "vitest";
import {
  applyReviewAction,
  buildResults,
  computeTotals,
  deriveStatus,
  finalPoints,
  hasTeacherChanges,
  mergeRegrade,
} from "@/lib/scoring";
import { answer, output, sampleRubric } from "./helpers";

const rubric = sampleRubric();
const MAX = 40;
const writing = (c1: number | null, c2: number | null, c3: number | null) =>
  answer("q3", null, {
    criteriaScores: [
      { criterionId: "c1", points: c1, explanation: "" },
      { criterionId: "c2", points: c2, explanation: "" },
      { criterionId: "c3", points: c3, explanation: "" },
    ],
  });

describe("score calculation", () => {
  it("sums question scores deterministically and ignores model arithmetic", () => {
    const { results } = buildResults(rubric, output([answer("q1", 7), answer("q2", 10), writing(6, 4, 5)]), "en");
    const t = computeTotals(rubric, results, MAX);
    expect(t.aiTotal).toBe(32);
    expect(t.currentTotal).toBe(32);
    expect(t.unresolved).toBe(0);
    expect(t.percent).toBe(80);
    expect(deriveStatus(rubric, results, MAX)).toBe("ready");
  });

  it("never lets a question exceed its maximum or go below zero", () => {
    const { results } = buildResults(rubric, output([answer("q1", 15), answer("q2", -3), writing(20, 6, 6)]), "en");
    expect(results[0].aiPoints).toBe(10);
    expect(results[1].aiPoints).toBe(0);
    expect(results[2].aiCriteria[0].aiPoints).toBe(8);
    expect(results[2].aiPoints).toBe(20);
    expect(results[0].needsReview).toBe(false);
    expect(results[0].reviewReason).toContain("הוגבל");
    const t = computeTotals(rubric, results, MAX);
    expect(t.currentTotal).toBeLessThanOrEqual(MAX);
    expect(t.currentTotal).toBe(30);
  });

  it("final score never exceeds the exam maximum even if the rubric total is larger", () => {
    const { results } = buildResults(rubric, output([answer("q1", 10), answer("q2", 10), writing(8, 6, 6)]), "en");
    expect(computeTotals(rubric, results, 30).currentTotal).toBe(30);
  });

  it("matches answers by question number when the model echoes numbers instead of ids", () => {
    const { results } = buildResults(rubric, output([answer("1", 5), answer("2", 5), writing(1, 1, 1)]), "en");
    expect(results[0].aiPoints).toBe(5);
  });

  it("flags questions the model skipped instead of inventing a score", () => {
    const { results, warnings } = buildResults(rubric, output([answer("q1", 5), answer("q99", 5)]), "en");
    expect(results).toHaveLength(3);
    expect(results[1].aiPoints).toBeNull();
    expect(results[1].needsReview).toBe(true);
    expect(warnings[0]).toContain("q99");
    const t = computeTotals(rubric, results, MAX);
    expect(t.unresolved).toBe(2);
    expect(deriveStatus(rubric, results, MAX)).toBe("needs_review");
  });

  it("never guesses unreadable answers", () => {
    const { results } = buildResults(
      rubric,
      output([answer("q1", 8, { readability: "unreadable" }), answer("q2", 10), writing(5, 5, 5)]),
      "en",
    );
    expect(results[0].aiPoints).toBeNull();
    expect(results[0].needsReview).toBe(true);
    expect(finalPoints(results[0], rubric.questions[0])).toBeNull();
  });

  it("flags low-confidence and partially unclear answers for review", () => {
    const { results } = buildResults(
      rubric,
      output([answer("q1", 8, { confidence: "low" }), answer("q2", 6, { readability: "partially_unclear" }), writing(5, 5, 5)]),
      "en",
    );
    expect(results[0].needsReview).toBe(true);
    expect(results[1].needsReview).toBe(true);
    expect(results[0].aiPoints).toBe(8); // suggestion is kept, but it does not count until the teacher accepts it
    expect(computeTotals(rubric, results, MAX).unresolved).toBe(2);
  });

  it("gives 0 for not-answered questions", () => {
    const { results } = buildResults(rubric, output([answer("q1", null, { readability: "not_answered" }), answer("q2", 5), writing(1, 1, 1)]), "en");
    expect(results[0].aiPoints).toBe(0);
  });

  it("keeps only the requested feedback language", () => {
    const he = buildResults(rubric, output([answer("q1", 5)]), "he").results[0].aiFeedback;
    expect(he).toEqual({ en: null, he: "משוב בעברית" });
    const both = buildResults(rubric, output([answer("q1", 5)]), "both").results[0].aiFeedback;
    expect(both.en && both.he).toBeTruthy();
  });
});

describe("teacher overrides", () => {
  const base = () => buildResults(rubric, output([answer("q1", 6), answer("q2", 10, { confidence: "low" }), writing(6, 4, 4)]), "en").results;

  it("teacher points take priority and update the total immediately", () => {
    const results = base();
    results[0] = applyReviewAction(results[0], rubric.questions[0], { type: "set_points", points: 9 });
    expect(results[0].decision).toBe("adjusted");
    expect(results[0].aiPoints).toBe(6); // AI suggestion is preserved for comparison
    const t = computeTotals(rubric, results, MAX);
    expect(t.aiTotal).toBe(30);
    expect(t.currentTotal).toBe(9 + 14); // q2 still unresolved
    expect(t.unresolved).toBe(1);
    expect(t.teacherAdjusted).toBe(true);
  });

  it("teacher points are clamped to the question maximum", () => {
    const r = applyReviewAction(base()[0], rubric.questions[0], { type: "set_points", points: 50 });
    expect(r.teacherPoints).toBe(10);
  });

  it("accepting a flagged suggestion resolves it", () => {
    const results = base();
    results[1] = applyReviewAction(results[1], rubric.questions[1], { type: "accept" });
    expect(finalPoints(results[1], rubric.questions[1])).toBe(10);
    expect(deriveStatus(rubric, results, MAX)).toBe("ready");
  });

  it("rejecting or marking for manual grading requires a teacher score", () => {
    const results = base();
    results[0] = applyReviewAction(results[0], rubric.questions[0], { type: "reject" });
    expect(finalPoints(results[0], rubric.questions[0])).toBeNull();
    results[0] = applyReviewAction(results[0], rubric.questions[0], { type: "mark_manual" });
    expect(results[0].decision).toBe("manual");
    results[0] = applyReviewAction(results[0], rubric.questions[0], { type: "set_points", points: 4 });
    expect(finalPoints(results[0], rubric.questions[0])).toBe(4);
  });

  it("per-criterion teacher scores replace the AI criterion scores", () => {
    const results = base();
    results[2] = applyReviewAction(results[2], rubric.questions[2], { type: "set_criterion", criterionId: "c2", points: 6 });
    expect(finalPoints(results[2], rubric.questions[2])).toBe(6 + 6 + 4);
    results[2] = applyReviewAction(results[2], rubric.questions[2], { type: "set_criterion", criterionId: "c1", points: 99 });
    expect(results[2].teacherCriteria!.c1).toBe(8);
  });

  it("cannot accept a suggestion that does not exist", () => {
    const { results } = buildResults(rubric, output([answer("q1", 5, { readability: "unreadable" })]), "en");
    expect(() => applyReviewAction(results[0], rubric.questions[0], { type: "accept" })).toThrow();
  });

  it("re-grading preserves teacher changes unless explicitly allowed", () => {
    const old = base();
    old[0] = applyReviewAction(old[0], rubric.questions[0], { type: "set_points", points: 9 });
    old[0] = applyReviewAction(old[0], rubric.questions[0], { type: "set_feedback", feedback: { en: "Mine", he: null } });
    expect(hasTeacherChanges(old)).toBe(true);
    const fresh = buildResults(rubric, output([answer("q1", 2), answer("q2", 3), writing(1, 1, 1)]), "en").results;

    const kept = mergeRegrade(old, fresh, false);
    expect(kept[0].teacherPoints).toBe(9);
    expect(kept[0].teacherFeedback?.en).toBe("Mine");
    expect(kept[0].aiPoints).toBe(2);
    expect(finalPoints(kept[0], rubric.questions[0])).toBe(9);

    const overwritten = mergeRegrade(old, fresh, true);
    expect(overwritten[0].teacherPoints).toBeNull();
    expect(finalPoints(overwritten[0], rubric.questions[0])).toBe(2);
  });
});
