import { describe, expect, it } from "vitest";
import { hasBlockingIssues, normalizeRubric, rubricHash, rubricTotal, validateRubric } from "@/lib/rubric";
import { q, sampleRubric } from "./helpers";

describe("rubric validation", () => {
  it("accepts a rubric whose total equals the max score", () => {
    const issues = validateRubric(sampleRubric(), 40);
    expect(hasBlockingIssues(issues)).toBe(false);
  });

  it("blocks locking when points do not add up to the max score", () => {
    const issues = validateRubric(sampleRubric(), 100);
    expect(hasBlockingIssues(issues)).toBe(true);
    expect(issues[0].message).toContain("40");
  });

  it("blocks empty rubrics, duplicate numbers and zero-point questions", () => {
    expect(hasBlockingIssues(validateRubric({ questions: [], generalInstructions: "" }, 10))).toBe(true);
    const dup = { generalInstructions: "", questions: [q({ id: "a", number: "1", maxPoints: 5 }), q({ id: "b", number: "1", maxPoints: 5 })] };
    expect(validateRubric(dup, 10).some((i) => i.message.includes("פעמים"))).toBe(true);
    const zero = { generalInstructions: "", questions: [q({ id: "a", number: "1", maxPoints: 0 })] };
    expect(hasBlockingIssues(validateRubric(zero, 0.0001))).toBe(true);
  });

  it("warns (but does not block) when a question has no answer or criteria", () => {
    const r = { generalInstructions: "", questions: [q({ id: "a", number: "1", maxPoints: 10, expectedAnswer: "" })] };
    const issues = validateRubric(r, 10);
    expect(issues).toHaveLength(1);
    expect(issues[0].severity).toBe("warning");
  });

  it("normalization keeps question max equal to the sum of its criteria and assigns ids", () => {
    const r = normalizeRubric({
      questions: [
        {
          id: "",
          number: " 3 ",
          maxPoints: 100,
          criteria: [
            { id: "", name: "Content", maxPoints: 5 },
            { id: "", name: "Grammar", maxPoints: 5 },
          ],
        },
      ],
    });
    expect(r.questions[0].maxPoints).toBe(10);
    expect(r.questions[0].number).toBe("3");
    expect(r.questions[0].id).toMatch(/^q_/);
    expect(r.questions[0].criteria.every((c) => c.id.startsWith("c_"))).toBe(true);
    expect(rubricTotal(r)).toBe(10);
  });

  it("hash is stable for identical rubrics and changes with any criterion change", () => {
    const ctx = { strictness: "balanced", maxScore: 40 };
    const a = rubricHash(sampleRubric(), ctx);
    expect(rubricHash(sampleRubric(), { maxScore: 40, strictness: "balanced" })).toBe(a);
    const changed = sampleRubric();
    changed.questions[1].acceptableAlternatives = ["glad"];
    expect(rubricHash(changed, ctx)).not.toBe(a);
    expect(rubricHash(sampleRubric(), { ...ctx, strictness: "strict" })).not.toBe(a);
  });
});
