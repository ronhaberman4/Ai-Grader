// Observed class statistics — computed deterministically from teacher-approved grades.
import { finalPoints, round2 } from "./scoring";
import type { AssessmentArea, MistakeCategory, Rubric, Submission } from "./types";

export type QuestionStat = {
  questionId: string;
  number: string;
  area: AssessmentArea;
  maxPoints: number;
  avgPoints: number;
  avgPercent: number;
  fullCreditRate: number;
  zeroRate: number;
};

export type ClassStats = {
  count: number;
  pendingCount: number;
  maxScore: number;
  average: number;
  averagePercent: number;
  median: number;
  highest: number;
  lowest: number;
  distribution: { label: string; from: number; to: number; count: number }[];
  perQuestion: QuestionStat[];
  mostMissed: QuestionStat[];
  areas: { area: AssessmentArea; avgPercent: number; questionCount: number }[];
  strongestArea: AssessmentArea | null;
  weakestArea: AssessmentArea | null;
  mistakeCategories: { category: MistakeCategory; count: number; students: number }[];
  commonMistakes: { category: MistakeCategory; description: string; count: number }[];
  needsSupport: { submissionId: string; studentName: string; score: number; percent: number; weakQuestions: string[] }[];
  students: { submissionId: string; studentName: string; score: number; percent: number }[];
};

export const SUPPORT_THRESHOLD_PERCENT = 60;

// Israeli school grade bands.
const BANDS = [
  { label: "0–54", from: 0, to: 55 },
  { label: "55–64", from: 55, to: 65 },
  { label: "65–74", from: 65, to: 75 },
  { label: "75–84", from: 75, to: 85 },
  { label: "85–94", from: 85, to: 95 },
  { label: "95–100", from: 95, to: 100.0001 },
];

export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

export function computeClassStats(rubric: Rubric, maxScore: number, submissions: Submission[]): ClassStats {
  const approved = submissions.filter((s) => s.status === "approved" && s.finalScore !== null && s.results);
  const scores = approved.map((s) => s.finalScore!);
  const pct = (score: number) => (maxScore > 0 ? round2((score / maxScore) * 100) : 0);

  const perQuestion: QuestionStat[] = rubric.questions.map((q) => {
    const pts = approved.map((s) => {
      const r = s.results!.find((x) => x.questionId === q.id);
      return r ? finalPoints(r, q) ?? 0 : 0;
    });
    const n = pts.length || 1;
    const avg = pts.reduce((a, b) => a + b, 0) / n;
    return {
      questionId: q.id,
      number: q.number,
      area: q.area,
      maxPoints: q.maxPoints,
      avgPoints: round2(avg),
      avgPercent: q.maxPoints > 0 ? round2((avg / q.maxPoints) * 100) : 0,
      fullCreditRate: round2((pts.filter((p) => p >= q.maxPoints).length / n) * 100),
      zeroRate: round2((pts.filter((p) => p === 0).length / n) * 100),
    };
  });

  const areaMap = new Map<AssessmentArea, { earned: number; possible: number; questions: number }>();
  for (const q of perQuestion) {
    const a = areaMap.get(q.area) ?? { earned: 0, possible: 0, questions: 0 };
    a.earned += q.avgPoints;
    a.possible += q.maxPoints;
    a.questions++;
    areaMap.set(q.area, a);
  }
  const areas = [...areaMap.entries()].map(([area, a]) => ({
    area,
    avgPercent: a.possible > 0 ? round2((a.earned / a.possible) * 100) : 0,
    questionCount: a.questions,
  }));
  const sortedAreas = [...areas].sort((a, b) => b.avgPercent - a.avgPercent);

  const catCount = new Map<MistakeCategory, { count: number; students: Set<string> }>();
  const mistakeCount = new Map<string, { category: MistakeCategory; description: string; count: number }>();
  for (const s of approved) {
    for (const r of s.results!) {
      for (const m of r.mistakes) {
        const c = catCount.get(m.category) ?? { count: 0, students: new Set<string>() };
        c.count++;
        c.students.add(s.id);
        catCount.set(m.category, c);
        const key = m.category + "|" + m.description.trim().toLowerCase();
        const e = mistakeCount.get(key) ?? { category: m.category, description: m.description.trim(), count: 0 };
        e.count++;
        mistakeCount.set(key, e);
      }
    }
  }

  const students = approved
    .map((s) => ({ submissionId: s.id, studentName: s.studentName, score: s.finalScore!, percent: pct(s.finalScore!) }))
    .sort((a, b) => b.score - a.score);

  const needsSupport = students
    .filter((s) => s.percent < SUPPORT_THRESHOLD_PERCENT)
    .map((st) => {
      const sub = approved.find((x) => x.id === st.submissionId)!;
      const weakQuestions = rubric.questions
        .filter((q) => {
          const r = sub.results!.find((x) => x.questionId === q.id);
          const p = r ? finalPoints(r, q) ?? 0 : 0;
          return q.maxPoints > 0 && p / q.maxPoints < 0.5;
        })
        .map((q) => q.number);
      return { ...st, weakQuestions };
    });

  const average = scores.length ? round2(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;

  return {
    count: approved.length,
    pendingCount: submissions.length - approved.length,
    maxScore,
    average,
    averagePercent: pct(average),
    median: round2(median(scores)),
    highest: scores.length ? Math.max(...scores) : 0,
    lowest: scores.length ? Math.min(...scores) : 0,
    distribution: BANDS.map((b) => ({
      ...b,
      count: scores.filter((s) => pct(s) >= b.from && pct(s) < b.to).length,
    })),
    perQuestion,
    mostMissed: [...perQuestion].filter((q) => q.avgPercent < 100).sort((a, b) => a.avgPercent - b.avgPercent).slice(0, 5),
    areas,
    strongestArea: sortedAreas.length > 1 ? sortedAreas[0].area : null,
    weakestArea: sortedAreas.length > 1 ? sortedAreas[sortedAreas.length - 1].area : null,
    mistakeCategories: [...catCount.entries()]
      .map(([category, c]) => ({ category, count: c.count, students: c.students.size }))
      .sort((a, b) => b.count - a.count),
    commonMistakes: [...mistakeCount.values()].sort((a, b) => b.count - a.count).slice(0, 60),
    needsSupport,
    students,
  };
}
