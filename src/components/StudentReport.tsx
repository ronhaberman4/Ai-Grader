"use client";

import { forwardRef } from "react";
import { effectiveFeedback, finalPoints } from "@/lib/scoring";
import type { FeedbackLanguage, GradingSession, LocalizedText, OverallFeedback, Submission } from "@/lib/types";
import { fmt } from "./ui";

const L = {
  report: { en: "Student Report", he: "דוח הערכה לתלמיד/ה" },
  student: { en: "Student", he: "שם" },
  class: { en: "Class", he: "כיתה" },
  exam: { en: "Assessment", he: "מבחן" },
  score: { en: "Final score", he: "ציון סופי" },
  percent: { en: "Percentage", he: "אחוז" },
  question: { en: "Question", he: "שאלה" },
  points: { en: "Points", he: "ניקוד" },
  feedback: { en: "Feedback", he: "משוב" },
  breakdown: { en: "Question-by-question results", he: "פירוט לפי שאלות" },
  strengths: { en: "Main strengths", he: "חוזקות עיקריות" },
  improvements: { en: "Areas for improvement", he: "תחומים לשיפור" },
  keyMistakes: { en: "Important mistakes explained", he: "טעויות חשובות והסבר" },
  recommendations: { en: "How to improve", he: "המלצות לשיפור" },
  teacher: { en: "Teacher's comments", he: "הערות המורה" },
  date: { en: "Date", he: "תאריך" },
} satisfies Record<string, { en: string; he: string }>;

function label(key: keyof typeof L, lang: FeedbackLanguage) {
  if (lang === "en") return L[key].en;
  if (lang === "he") return L[key].he;
  return `${L[key].he} · ${L[key].en}`;
}

function Text({ t, lang }: { t: LocalizedText; lang: FeedbackLanguage }) {
  return (
    <>
      {lang !== "he" && t.en && (
        <span className="block" dir="ltr">
          {t.en}
        </span>
      )}
      {lang !== "en" && t.he && (
        <span className="block" dir="rtl">
          {t.he}
        </span>
      )}
    </>
  );
}

export const StudentReport = forwardRef<HTMLDivElement, { session: GradingSession; sub: Submission }>(function StudentReport({ session, sub }, ref) {
  const lang = session.feedbackLanguage;
  const dir = lang === "en" ? "ltr" : "rtl";
  const rubric = session.rubric!;
  const overall: OverallFeedback | null = sub.teacherOverall ?? sub.overall;
  const score = sub.finalScore ?? 0;
  const percent = session.maxScore ? Math.round((score / session.maxScore) * 1000) / 10 : 0;
  const date = new Date(sub.approvedAt ?? Date.now()).toLocaleDateString(lang === "en" ? "en-GB" : "he-IL");

  return (
    <div ref={ref} dir={dir} className="mx-auto w-[794px] bg-white p-10 text-[13px] leading-relaxed text-slate-900" style={{ fontFamily: "Heebo, Arial, sans-serif" }}>
      <div data-pdf-block className="flex items-start justify-between border-b-2 border-indigo-700 pb-4">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-indigo-700">{label("report", lang)}</div>
          <div className="mt-1 text-2xl font-bold" dir="auto">
            {sub.studentName}
          </div>
          <div className="mt-1 text-slate-600">
            <span dir="auto">{session.name}</span>
            {session.className && (
              <>
                {" · "}
                {label("class", lang)}: <span dir="auto">{session.className}</span>
              </>
            )}
            {" · "}
            {label("date", lang)}: {date}
          </div>
        </div>
        <div className="rounded-xl bg-indigo-50 px-5 py-3 text-center">
          <div className="text-xs text-slate-600">{label("score", lang)}</div>
          <div className="text-3xl font-bold text-indigo-800" dir="ltr">
            {fmt(score)}
            <span className="text-base font-medium text-slate-500"> / {fmt(session.maxScore)}</span>
          </div>
          <div className="text-sm text-slate-600" dir="ltr">
            {fmt(percent)}%
          </div>
        </div>
      </div>

      <h2 data-pdf-block className="mt-6 mb-2 text-base font-bold">
        {label("breakdown", lang)}
      </h2>
      <table className="w-full border-collapse">
        <thead>
          <tr data-pdf-block className="bg-slate-100 text-xs">
            <th className="w-16 p-2 text-start">{label("question", lang)}</th>
            <th className="w-20 p-2 text-start">{label("points", lang)}</th>
            <th className="p-2 text-start">{label("feedback", lang)}</th>
          </tr>
        </thead>
        <tbody>
          {rubric.questions.map((q) => {
            const r = sub.results?.find((x) => x.questionId === q.id);
            if (!r) return null;
            const p = finalPoints(r, q) ?? 0;
            return (
              <tr key={q.id} data-pdf-block className="border-b border-slate-200 align-top">
                <td className="p-2 font-semibold" dir="ltr">
                  {q.number}
                </td>
                <td className="p-2" dir="ltr">
                  <span className={p >= q.maxPoints ? "text-emerald-700" : p === 0 ? "text-rose-700" : ""}>
                    {fmt(p)} / {fmt(q.maxPoints)}
                  </span>
                </td>
                <td className="p-2">
                  <Text t={effectiveFeedback(r)} lang={lang} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {overall &&
        (["strengths", "improvements", "keyMistakes", "recommendations"] as const).map((k) =>
          overall[k].length ? (
            <section key={k} className="mt-5">
              <h2 data-pdf-block className="mb-1.5 text-base font-bold">
                {label(k, lang)}
              </h2>
              <ul className="space-y-1.5">
                {overall[k].map((t, i) => (
                  <li key={i} data-pdf-block className="flex gap-2">
                    <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-indigo-600" />
                    <div>
                      <Text t={t} lang={lang} />
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ) : null,
        )}

      {sub.teacherComment.trim() && (
        <section data-pdf-block className="mt-6 rounded-lg border border-slate-200 bg-slate-50 p-4">
          <h2 className="mb-1 text-base font-bold">{label("teacher", lang)}</h2>
          <p className="whitespace-pre-wrap" dir="auto">
            {sub.teacherComment}
          </p>
        </section>
      )}
    </div>
  );
});
