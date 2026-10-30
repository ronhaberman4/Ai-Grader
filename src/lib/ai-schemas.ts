import { z } from "zod";
import { ASSESSMENT_AREAS, CONFIDENCE, MISTAKE_CATEGORIES, READABILITY } from "./types";

// Schemas for Claude structured outputs. Every field is required, so optional
// values are expressed as nullable.

const Localized = z.object({ en: z.string().nullable(), he: z.string().nullable() });

export const RubricExtractionSchema = z.object({
  questions: z.array(
    z.object({
      number: z.string(),
      section: z.string(),
      prompt: z.string(),
      area: z.enum(ASSESSMENT_AREAS),
      maxPoints: z.number(),
      expectedAnswer: z.string(),
      acceptableAlternatives: z.array(z.string()),
      partialCreditRules: z.string(),
      criteria: z.array(z.object({ name: z.string(), maxPoints: z.number(), description: z.string() })),
      notes: z.string(),
    }),
  ),
  generalInstructions: z.string(),
  issues: z.array(
    z.object({
      severity: z.enum(["error", "warning"]),
      questionNumber: z.string().nullable(),
      message: z.string(),
    }),
  ),
});
export type RubricExtraction = z.infer<typeof RubricExtractionSchema>;

export const GradingOutputSchema = z.object({
  detectedStudentName: z.string().nullable(),
  answers: z.array(
    z.object({
      questionId: z.string(),
      studentAnswer: z.string(),
      readability: z.enum(READABILITY),
      awardedPoints: z.number().nullable(),
      criteriaScores: z.array(
        z.object({ criterionId: z.string(), points: z.number().nullable(), explanation: z.string() }),
      ),
      explanation: z.string(),
      feedback: Localized,
      confidence: z.enum(CONFIDENCE),
      needsTeacherReview: z.boolean(),
      reviewReason: z.string().nullable(),
      mistakes: z.array(z.object({ category: z.enum(MISTAKE_CATEGORIES), description: z.string() })),
    }),
  ),
  overall: z.object({
    strengths: z.array(Localized),
    improvements: z.array(Localized),
    keyMistakes: z.array(Localized),
    recommendations: z.array(Localized),
  }),
  rubricConcerns: z.array(z.string()),
});
export type GradingOutput = z.infer<typeof GradingOutputSchema>;

export const InsightsOutputSchema = z.object({
  insights: z.array(
    z.object({ title: z.string(), observation: z.string(), evidence: z.string(), recommendation: z.string() }),
  ),
  reviewTopics: z.array(z.string()),
});
export type InsightsOutput = z.infer<typeof InsightsOutputSchema>;
