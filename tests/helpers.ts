import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { z } from "zod";
import { setModelClientForTests, type ModelClient, type StructuredRequest } from "@/lib/ai";
import type { GradingOutput } from "@/lib/ai-schemas";
import { resetDbForTests } from "@/lib/db";
import { resetQueueForTests } from "@/lib/service";
import type { Rubric, RubricQuestion } from "@/lib/types";

export function useTempData() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "grader-test-"));
  process.env.DATA_DIR = dir;
  process.env.DB_FILE = path.join(dir, "test.db");
  resetDbForTests();
  resetQueueForTests();
  return dir;
}

export function q(partial: Partial<RubricQuestion> & { id: string; maxPoints: number }): RubricQuestion {
  return {
    number: partial.id,
    section: "",
    prompt: "",
    area: "reading",
    expectedAnswer: "answer",
    acceptableAlternatives: [],
    partialCreditRules: "",
    criteria: [],
    notes: "",
    ...partial,
  };
}

export function sampleRubric(): Rubric {
  return {
    generalInstructions: "",
    questions: [
      q({ id: "q1", number: "1", maxPoints: 10, expectedAnswer: "Tom was late because the bus broke down." }),
      q({ id: "q2", number: "2", maxPoints: 10, area: "vocabulary", expectedAnswer: "happy" }),
      q({
        id: "q3",
        number: "3",
        maxPoints: 20,
        area: "writing",
        expectedAnswer: "",
        criteria: [
          { id: "c1", name: "Content", maxPoints: 8, description: "" },
          { id: "c2", name: "Grammar", maxPoints: 6, description: "" },
          { id: "c3", name: "Mechanics", maxPoints: 6, description: "" },
        ],
      }),
    ],
  };
}

type Answer = GradingOutput["answers"][number];

export function answer(questionId: string, awardedPoints: number | null, extra: Partial<Answer> = {}): Answer {
  return {
    questionId,
    studentAnswer: "student text",
    readability: "clear",
    awardedPoints,
    criteriaScores: [],
    explanation: "הסבר",
    feedback: { en: "Feedback in English", he: "משוב בעברית" },
    confidence: "high",
    needsTeacherReview: false,
    reviewReason: null,
    mistakes: [],
    ...extra,
  };
}

export function output(answers: Answer[], name: string | null = null): GradingOutput {
  return {
    detectedStudentName: name,
    answers,
    overall: {
      strengths: [{ en: "Clear ideas", he: "רעיונות ברורים" }],
      improvements: [{ en: "Past tense", he: "זמן עבר" }],
      keyMistakes: [],
      recommendations: [{ en: "Practice irregular verbs", he: "תרגול פעלים חריגים" }],
    },
    rubricConcerns: [],
  };
}

/** Fake model that records every request and answers with a callback. */
export function fakeModel(respond: (req: StructuredRequest<z.ZodTypeAny>) => unknown | Promise<unknown>) {
  const calls: StructuredRequest<z.ZodTypeAny>[] = [];
  const client: ModelClient = {
    model: "fake-model",
    async structured(req) {
      calls.push(req);
      const data = await respond(req);
      return req.schema.parse(data);
    },
  };
  setModelClientForTests(client);
  return { calls, client };
}
