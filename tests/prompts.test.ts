import { describe, expect, it } from "vitest";
import { gradingInstructions, languageRule, STRICTNESS_RULES, TONE_RULES } from "@/lib/prompts";
import { STRICTNESS, TONES, type GradingSession } from "@/lib/types";
import { sampleRubric } from "./helpers";

function session(over: Partial<GradingSession> = {}): GradingSession {
  return {
    id: "s1", name: "Unit 3 Test", className: "ט'2", subject: "English", maxScore: 40, cefrLevel: "A2",
    assessmentType: "mixed", strictness: "balanced", tone: "encouraging", feedbackLanguage: "both",
    specialInstructions: "Do not penalize spelling twice.", rubric: sampleRubric(), rubricIssues: [],
    rubricSourceText: "", rubricLockedAt: "x", rubricHash: "h", insights: null, insightsAt: null,
    createdAt: "", updatedAt: "", ...over,
  };
}

function sections(text: string) {
  const scoring = text.slice(text.indexOf("PART 1 — SCORING"), text.indexOf("PART 2 — FEEDBACK"));
  const feedback = text.slice(text.indexOf("PART 2 — FEEDBACK"));
  return { scoring, feedback };
}

describe("grading modes", () => {
  it("has four distinct strictness modes and six tones", () => {
    expect(new Set(Object.values(STRICTNESS_RULES)).size).toBe(4);
    expect(new Set(Object.values(TONE_RULES)).size).toBe(6);
  });

  it.each(STRICTNESS)("strictness %s only appears in the scoring section", (strictness) => {
    const { scoring, feedback } = sections(gradingInstructions(session({ strictness }), sampleRubric()));
    expect(scoring).toContain(STRICTNESS_RULES[strictness]);
    expect(feedback).not.toContain(STRICTNESS_RULES[strictness]);
  });

  it.each(TONES)("tone %s only appears in the feedback section", (tone) => {
    const { scoring, feedback } = sections(gradingInstructions(session({ tone }), sampleRubric()));
    expect(feedback).toContain(TONE_RULES[tone]);
    expect(scoring).not.toContain(TONE_RULES[tone]);
  });

  it("very strict grading with encouraging feedback is a valid combination", () => {
    const text = gradingInstructions(session({ strictness: "very_strict", tone: "encouraging" }), sampleRubric());
    expect(text).toContain("VERY STRICT");
    expect(text).toContain("ENCOURAGING");
  });

  it("rubric rules override strictness, and the locked rubric + special instructions are embedded", () => {
    const text = gradingInstructions(session(), sampleRubric());
    expect(text).toContain("ALWAYS override the strictness");
    expect(text).toContain("Do not penalize spelling twice.");
    expect(text).toContain('"questionId": "q3"');
    expect(text).toContain('"criterionId": "c2"');
  });

  it("language rule requests the right fields", () => {
    expect(languageRule("en", "A1")).toContain('every "he" field to null');
    expect(languageRule("he", "B1")).toContain('every "en" field to null');
    expect(languageRule("both", "C1")).toContain("BOTH");
    expect(languageRule("en", "A1")).toContain("very simple English");
  });
});
