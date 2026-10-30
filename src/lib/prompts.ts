import type { ClassStats } from "./analytics";
import { ASSESSMENT_TYPE_LABELS } from "./labels";
import type { AssessmentType, FeedbackLanguage, GradingSession, Rubric, SessionSettings, Strictness, Tone } from "./types";

// ----- Scoring controls (strictness). These affect points only. -----

export const STRICTNESS_RULES: Record<Strictness, string> = {
  lenient:
    "LENIENT: Give reasonable credit for partially correct answers. Focus primarily on demonstrated understanding. " +
    "Avoid unnecessary penalties; when an answer is borderline, lean towards the higher score the rubric allows.",
  balanced:
    "BALANCED: Follow the rubric fairly. Recognize correct understanding, and deduct points for meaningful errors only. " +
    "Minor slips that do not affect what the question assesses should not cost points.",
  strict:
    "STRICT: Apply the rubric standards carefully and deduct points consistently for every error the rubric covers. " +
    "Give partial credit only where the rubric's partial-credit rules support it.",
  very_strict:
    "VERY STRICT: Apply every explicit rubric criterion rigorously. Accept only the expected answer or the listed " +
    "acceptable alternatives (meaning-equivalent wording is acceptable only when the rubric permits paraphrase). Limited flexibility.",
};

// ----- Feedback controls (tone). These affect wording only, never points. -----

export const TONE_RULES: Record<Tone, string> = {
  encouraging: "ENCOURAGING: warm and motivating; highlight progress and effort, frame mistakes as next steps.",
  friendly: "FRIENDLY: relaxed and approachable, like a supportive teacher talking to the student.",
  professional: "PROFESSIONAL: neutral, clear and precise; no emotional language.",
  gentle: "GENTLE: soft and reassuring; point out mistakes carefully and kindly, avoid harsh words.",
  direct: "DIRECT: short and to the point; state exactly what was wrong and how to fix it.",
  firm: "FIRM: serious and demanding while respectful; make clear what must improve.",
};

const CEFR_FEEDBACK: Record<string, string> = {
  A1: "very simple English: short sentences, the most common 500 words, present simple. Add a Hebrew gloss for any harder word only in bilingual mode.",
  A2: "simple English: short sentences, everyday vocabulary, basic tenses.",
  B1: "clear intermediate English with common vocabulary and straightforward sentences.",
  B2: "natural upper-intermediate English; you may use grammatical terms such as 'present perfect'.",
  C1: "fluent advanced English; precise terminology is fine.",
};

export function languageRule(lang: FeedbackLanguage, cefr: string): string {
  const en = `Write English feedback in ${CEFR_FEEDBACK[cefr] ?? CEFR_FEEDBACK.B1}`;
  const he = "Write Hebrew feedback in clear, age-appropriate Hebrew for Israeli school students.";
  if (lang === "en") return `${en} Fill only the "en" fields; set every "he" field to null.`;
  if (lang === "he") return `${he} Fill only the "he" fields; set every "en" field to null.`;
  return `${en} ${he} Fill BOTH "en" and "he" fields with equivalent content.`;
}

const TYPE_RULES: Record<AssessmentType, string> = {
  reading:
    "READING COMPREHENSION: prioritize comprehension of the text. Accept meaningful paraphrasing; the answer does not need the key's exact wording. " +
    "Do not deduct for grammar or spelling unless it changes the meaning or the rubric explicitly requires it. Recognize partially correct answers.",
  vocabulary:
    "VOCABULARY: check meaning, context and the required word form. Apply the teacher's spelling rules exactly as written in the rubric/instructions; if none are given, do not deduct for spelling that still clearly shows the correct word, and flag for review.",
  grammar:
    "GRAMMAR: check the target grammatical structure of each item. Distinguish a grammar error in the target structure from unrelated spelling errors. Apply partial credit only according to the rubric.",
  writing:
    "WRITING: score each rubric criterion (e.g. Content, Organization, Vocabulary, Grammar, Mechanics) separately within its own maximum. " +
    "Judge against the CEFR level of the class. Do NOT invent requirements (length, topic sentences, etc.) that are not in the rubric.",
  literature:
    "LITERATURE: grade comprehension, use of textual evidence, and interpretation according to the teacher's criteria. Accept alternative interpretations that are supported by the text when the rubric allows them.",
  mixed:
    "MIXED EXAM: apply the rule that matches each question's area (reading: meaning over form; vocabulary: meaning and form; grammar: target structure; writing: per-criterion; literature: evidence and interpretation).",
  general: "GENERAL ASSIGNMENT: grade strictly against the rubric criteria and expected answers.",
};

const AREA_RULES =
  "Per-question area rules: area=reading → meaning over form, no grammar penalty unless meaning changes; area=vocabulary → meaning, context, word form; " +
  "area=grammar → the target structure; area=writing → score each criterion separately; area=literature → evidence and supported interpretation.";

function settingsBlock(s: SessionSettings): string {
  return [
    `Exam: ${s.name}`,
    `Subject: ${s.subject || "English"}`,
    `Class CEFR level: ${s.cefrLevel}`,
    `Assessment type: ${s.assessmentType} (${ASSESSMENT_TYPE_LABELS[s.assessmentType]})`,
    `Maximum exam score: ${s.maxScore}`,
  ].join("\n");
}

// ---------------- Rubric extraction ----------------

export function rubricExtractionInstructions(s: SessionSettings): string {
  return `You are an assistant to an Israeli school teacher. Your job is to turn the teacher's exam, answer key and grading rubric into a structured rubric.

${settingsBlock(s)}

Rules:
- Extract every gradable question and sub-question as its own item. Use the numbering of the exam (e.g. "1", "2a", "2b", "III.3").
- "section" is the part/chapter of the exam (e.g. "Reading", "Part B") or "" if none.
- "prompt" is the question text (short form is fine). "area" is the skill the question assesses.
- "expectedAnswer" comes from the answer key. "acceptableAlternatives" lists alternative answers explicitly allowed or obviously equivalent wordings given by the teacher.
- "partialCreditRules" describes how partial points are given, ONLY as stated or clearly implied by the teacher's materials.
- For writing tasks or any question scored by categories, put the categories in "criteria" with their points; the question's maxPoints must equal the sum of criteria points. For other questions use an empty criteria list.
- Put the teacher's special instructions and general rules (spelling policy, paraphrase policy, etc.) in "generalInstructions" (keep the teacher's language).
- NEVER invent grading criteria, answers or point values that are not in the materials. If something is missing or unclear (missing points, missing answer, points that do not add up to ${s.maxScore}, contradictions, unreadable handwriting), leave the field empty (or 0 points) and add an item to "issues" written in Hebrew, so the teacher can decide.
- Handwritten or scanned materials: read carefully; if a part is unreadable, report it in "issues" rather than guessing.

Teacher's special grading instructions (must be preserved in generalInstructions):
${s.specialInstructions.trim() || "(none)"}`;
}

// ---------------- Grading ----------------

export function gradingContextForHash(s: GradingSession) {
  return {
    maxScore: s.maxScore,
    cefrLevel: s.cefrLevel,
    assessmentType: s.assessmentType,
    strictness: s.strictness,
    tone: s.tone,
    feedbackLanguage: s.feedbackLanguage,
    specialInstructions: s.specialInstructions,
  };
}

export function gradingInstructions(s: GradingSession, rubric: Rubric): string {
  const rubricForModel = rubric.questions.map((q) => ({
    questionId: q.id,
    number: q.number,
    section: q.section,
    prompt: q.prompt,
    area: q.area,
    maxPoints: q.maxPoints,
    expectedAnswer: q.expectedAnswer,
    acceptableAlternatives: q.acceptableAlternatives,
    partialCreditRules: q.partialCreditRules,
    criteria: q.criteria.map((c) => ({ criterionId: c.id, name: c.name, maxPoints: c.maxPoints, description: c.description })),
    notes: q.notes,
  }));

  return `You are a careful, fair assistant grader for an Israeli school teacher. You produce SUGGESTED grades; the teacher makes every final decision.

${settingsBlock(s)}

=== LOCKED RUBRIC (the only grading criteria you may use) ===
${JSON.stringify(rubricForModel, null, 1)}

General rubric instructions from the teacher:
${rubric.generalInstructions.trim() || "(none)"}

Teacher's special grading instructions:
${s.specialInstructions.trim() || "(none)"}

=== PART 1 — SCORING (points) ===
Strictness mode: ${STRICTNESS_RULES[s.strictness]}
${TYPE_RULES[s.assessmentType]}
${AREA_RULES}
Scoring rules:
1. Find the student's answer to every rubric question (use the question numbers on the page) and return exactly one item per questionId above, using that questionId.
2. Transcribe the student's answer faithfully in "studentAnswer" (do not correct it). Never invent text you cannot read.
3. Compare it to the expected answer, acceptable alternatives and partial-credit rules. The rubric and the teacher's instructions ALWAYS override the strictness mode.
4. Never deduct points for anything the rubric and teacher instructions do not cover. Never add new requirements.
5. awardedPoints must be between 0 and the question's maxPoints. For questions with criteria, give a score per criterion in criteriaScores (0..criterion maxPoints) and set awardedPoints to null; for other questions use an empty criteriaScores list.
6. Do not penalize the same mistake twice if the teacher's instructions say so.
7. If the student did not answer: readability "not_answered", awardedPoints 0.
8. If the handwriting or scan is unreadable: readability "unreadable", awardedPoints null, needsTeacherReview true, and explain in reviewReason (Hebrew). If only partly readable: "partially_unclear", give your best supported score, needsTeacherReview true.
9. If you are unsure how the rubric applies (ambiguous answer, rubric gap), set confidence "low" or "medium", needsTeacherReview true and explain in reviewReason (Hebrew). Do not pretend to be certain.
10. "explanation" (Hebrew, for the teacher): why these points were awarded, which required elements were present or missing, and what each deduction was for.
11. "mistakes": list concrete errors with a category and a short English description (e.g. "past simple: 'goed' instead of 'went'", "missed inference about the main character's motive").
12. If you notice a problem in the rubric itself (wrong answer key, missing criterion), do NOT change how you grade — report it in rubricConcerns (Hebrew).

=== PART 2 — FEEDBACK (words only; must NOT influence points) ===
Feedback tone: ${TONE_RULES[s.tone]}
Language: ${languageRule(s.feedbackLanguage, s.cefrLevel)}
- "feedback" for each question is addressed to the student: specific, constructive, tied to their actual answer. Explain what was right and what to fix. Never write generic praise like "Good job" without saying what was good.
- "overall": 2-4 strengths, 2-4 areas for improvement, the most important mistakes with a short explanation, and 2-4 practical recommendations — all based on this student's work.
- The tone only changes the wording. A very strict grade can have encouraging feedback.

detectedStudentName: the student's name if it is written on the submission, otherwise null.`;
}

export const GRADING_USER_PREAMBLE =
  "Below is the student's submission (all pages, in order). Grade it according to the locked rubric.";

// ---------------- Class insights ----------------

export function insightsInstructions(s: GradingSession): string {
  return `You help an Israeli ${s.subject || "English"} teacher understand class results for "${s.name}" (CEFR ${s.cefrLevel}).
You receive OBSERVED DATA (computed statistics and lists of mistakes). Write practical teaching insights in Hebrew.
- Every insight must be grounded in the data; put the supporting numbers in "evidence".
- Example style: "רוב התלמידים הבינו את הרעיון המרכזי של הקטע, אך התקשו בשאלות הסקה."
- "recommendation": a concrete idea for the next lessons.
- "reviewTopics": short list of topics worth reviewing in class.
- Do not mention student names. Do not invent data.`;
}

export function insightsInput(stats: ClassStats, rubric: Rubric): string {
  return JSON.stringify(
    {
      gradedStudents: stats.count,
      average: stats.average,
      median: stats.median,
      maxScore: stats.maxScore,
      perQuestion: stats.perQuestion.map((q) => ({
        number: q.number,
        area: q.area,
        prompt: rubric.questions.find((x) => x.id === q.questionId)?.prompt ?? "",
        averagePercent: q.avgPercent,
        fullCreditRate: q.fullCreditRate,
      })),
      areas: stats.areas,
      mistakeCategories: stats.mistakeCategories,
      frequentMistakes: stats.commonMistakes.slice(0, 40),
    },
    null,
    1,
  );
}
