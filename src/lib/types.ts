import { z } from "zod";

// ---------- Session settings ----------

export const CEFR_LEVELS = ["A1", "A2", "B1", "B2", "C1"] as const;
export const ASSESSMENT_TYPES = [
  "reading",
  "vocabulary",
  "grammar",
  "writing",
  "literature",
  "mixed",
  "general",
] as const;
export const STRICTNESS = ["lenient", "balanced", "strict", "very_strict"] as const;
export const TONES = ["encouraging", "friendly", "professional", "gentle", "direct", "firm"] as const;
export const FEEDBACK_LANGUAGES = ["en", "he", "both"] as const;
export const ASSESSMENT_AREAS = ["reading", "vocabulary", "grammar", "writing", "literature", "other"] as const;

export type CefrLevel = (typeof CEFR_LEVELS)[number];
export type AssessmentType = (typeof ASSESSMENT_TYPES)[number];
export type Strictness = (typeof STRICTNESS)[number];
export type Tone = (typeof TONES)[number];
export type FeedbackLanguage = (typeof FEEDBACK_LANGUAGES)[number];
export type AssessmentArea = (typeof ASSESSMENT_AREAS)[number];

export const SessionSettingsSchema = z.object({
  name: z.string().trim().min(1, "יש להזין שם למבחן"),
  className: z.string().trim().default(""),
  subject: z.string().trim().default("English"),
  maxScore: z.number().positive("ציון מקסימלי חייב להיות חיובי").max(1000),
  cefrLevel: z.enum(CEFR_LEVELS),
  assessmentType: z.enum(ASSESSMENT_TYPES),
  strictness: z.enum(STRICTNESS),
  tone: z.enum(TONES),
  feedbackLanguage: z.enum(FEEDBACK_LANGUAGES),
  specialInstructions: z.string().default(""),
});
export type SessionSettings = z.infer<typeof SessionSettingsSchema>;

// ---------- Rubric ----------

export const RubricCriterionSchema = z.object({
  id: z.string(),
  name: z.string(),
  maxPoints: z.number().min(0),
  description: z.string().default(""),
});
export type RubricCriterion = z.infer<typeof RubricCriterionSchema>;

export const RubricQuestionSchema = z.object({
  id: z.string(),
  number: z.string(),
  section: z.string().default(""),
  prompt: z.string().default(""),
  area: z.enum(ASSESSMENT_AREAS).default("other"),
  maxPoints: z.number().min(0),
  expectedAnswer: z.string().default(""),
  acceptableAlternatives: z.array(z.string()).default([]),
  partialCreditRules: z.string().default(""),
  criteria: z.array(RubricCriterionSchema).default([]),
  notes: z.string().default(""),
});
export type RubricQuestion = z.infer<typeof RubricQuestionSchema>;

export const RubricSchema = z.object({
  questions: z.array(RubricQuestionSchema).default([]),
  generalInstructions: z.string().default(""),
});
export type Rubric = z.infer<typeof RubricSchema>;

export type RubricIssue = {
  severity: "error" | "warning";
  questionNumber: string | null;
  message: string;
  source: "system" | "ai";
};

// ---------- Grading results ----------

export const LocalizedTextSchema = z.object({
  en: z.string().nullable(),
  he: z.string().nullable(),
});
export type LocalizedText = z.infer<typeof LocalizedTextSchema>;

export const READABILITY = ["clear", "partially_unclear", "unreadable", "not_answered"] as const;
export const CONFIDENCE = ["high", "medium", "low"] as const;
export const MISTAKE_CATEGORIES = [
  "grammar",
  "vocabulary",
  "spelling",
  "comprehension",
  "inference",
  "content",
  "organization",
  "mechanics",
  "other",
] as const;
export type Readability = (typeof READABILITY)[number];
export type Confidence = (typeof CONFIDENCE)[number];
export type MistakeCategory = (typeof MISTAKE_CATEGORIES)[number];

export const MistakeSchema = z.object({
  category: z.enum(MISTAKE_CATEGORIES),
  description: z.string(),
});
export type Mistake = z.infer<typeof MistakeSchema>;

export type Decision = "pending" | "accepted" | "adjusted" | "rejected" | "manual";

export type CriterionResult = {
  criterionId: string;
  aiPoints: number | null;
  explanation: string;
};

/** One graded question for one student, as stored in the database. */
export type QuestionResult = {
  questionId: string;
  studentAnswer: string;
  readability: Readability;
  aiPoints: number | null;
  aiCriteria: CriterionResult[];
  explanation: string;
  aiFeedback: LocalizedText;
  confidence: Confidence;
  needsReview: boolean;
  reviewReason: string | null;
  mistakes: Mistake[];
  // Teacher layer — never overwritten by the AI without explicit permission.
  teacherPoints: number | null;
  teacherCriteria: Record<string, number> | null;
  teacherFeedback: LocalizedText | null;
  decision: Decision;
};

export type OverallFeedback = {
  strengths: LocalizedText[];
  improvements: LocalizedText[];
  keyMistakes: LocalizedText[];
  recommendations: LocalizedText[];
};

export const SUBMISSION_STATUSES = [
  "uploaded",
  "processing",
  "needs_review",
  "ready",
  "approved",
  "failed",
] as const;
export type SubmissionStatus = (typeof SUBMISSION_STATUSES)[number];

export type NameSource = "filename" | "document" | "manual" | "none";

export type StoredFile = {
  id: string;
  filename: string;
  storedPath: string;
  mime: string;
  size: number;
};

export type SessionFileKind = "exam" | "answer_key" | "rubric";

export type SessionFile = StoredFile & { sessionId: string; kind: SessionFileKind; createdAt: string };

export type SubmissionFile = StoredFile & { submissionId: string; pageOrder: number };

export type GradingSession = SessionSettings & {
  id: string;
  rubric: Rubric | null;
  rubricIssues: RubricIssue[];
  rubricSourceText: string;
  rubricLockedAt: string | null;
  rubricHash: string | null;
  insights: ClassInsights | null;
  insightsAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type Submission = {
  id: string;
  sessionId: string;
  studentName: string;
  nameSource: NameSource;
  detectedName: string | null;
  status: SubmissionStatus;
  error: string | null;
  results: QuestionResult[] | null;
  overall: OverallFeedback | null;
  teacherOverall: OverallFeedback | null;
  teacherComment: string;
  rubricHash: string | null;
  aiModel: string | null;
  aiTotal: number | null;
  finalScore: number | null;
  gradedAt: string | null;
  approvedAt: string | null;
  createdAt: string;
  updatedAt: string;
  files: SubmissionFile[];
};

export type ClassInsight = {
  title: string;
  observation: string;
  evidence: string;
  recommendation: string;
};

export type ClassInsights = {
  insights: ClassInsight[];
  reviewTopics: string[];
  basedOnCount: number;
};
