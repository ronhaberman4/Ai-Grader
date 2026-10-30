"use client";

import { useEffect, useState } from "react";
import { AREA_LABELS, CONFIDENCE_LABELS, DECISION_LABELS, MISTAKE_LABELS, READABILITY_LABELS } from "@/lib/labels";
import { effectiveFeedback, finalPoints, type ReviewAction } from "@/lib/scoring";
import type { FeedbackLanguage, LocalizedText, QuestionResult, RubricQuestion } from "@/lib/types";
import { Badge, Button, Spinner, fmt, inputClass, inputBase } from "./ui";

export function QuestionReview({
  q,
  r,
  lang,
  readOnly,
  busy,
  onAction,
}: {
  q: RubricQuestion;
  r: QuestionResult;
  lang: FeedbackLanguage;
  readOnly: boolean;
  busy: boolean;
  onAction: (a: ReviewAction) => void;
}) {
  const final = finalPoints(r, q);
  const unresolved = final === null;
  const border = unresolved ? "border-amber-300" : r.decision === "adjusted" ? "border-indigo-300" : "border-slate-200";

  return (
    <article className={`rounded-xl border bg-white ${border}`}>
      <header className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-4 py-2.5">
        <h3 className="font-semibold">
          שאלה <span className="ltr">{q.number}</span>
        </h3>
        {q.section && <span className="text-xs text-slate-500" dir="auto">{q.section}</span>}
        <Badge>{AREA_LABELS[q.area]}</Badge>
        <Badge tone={r.confidence === "high" ? "green" : r.confidence === "medium" ? "slate" : "red"}>{CONFIDENCE_LABELS[r.confidence]}</Badge>
        {r.readability !== "clear" && <Badge tone={r.readability === "unreadable" ? "red" : "amber"}>{READABILITY_LABELS[r.readability]}</Badge>}
        <Badge tone={r.decision === "pending" ? "slate" : r.decision === "adjusted" || r.decision === "accepted" ? "indigo" : "amber"}>
          {DECISION_LABELS[r.decision]}
        </Badge>
        <div className="ms-auto flex items-center gap-2 text-sm">
          {busy && <Spinner className="text-slate-400" />}
          <span className="text-slate-500">ניקוד:</span>
          <b className={`ltr text-base ${unresolved ? "text-amber-700" : ""}`}>
            {final === null ? "?" : fmt(final)} / {fmt(q.maxPoints)}
          </b>
        </div>
      </header>

      <div className="space-y-3 p-4">
        {r.needsReview && r.reviewReason && (
          <div className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">⚠ {r.reviewReason}</div>
        )}
        {q.prompt && <div className="text-sm text-slate-500" dir="auto">{q.prompt}</div>}
        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <div className="mb-1 text-xs font-semibold text-slate-500">תשובת התלמיד/ה</div>
            <div className="min-h-10 whitespace-pre-wrap rounded-lg bg-slate-50 p-2.5 text-sm" dir="auto">
              {r.studentAnswer || <span className="text-slate-400">(אין תשובה)</span>}
            </div>
          </div>
          <div>
            <div className="mb-1 text-xs font-semibold text-slate-500">תשובה צפויה / קריטריון</div>
            <div className="min-h-10 whitespace-pre-wrap rounded-lg bg-emerald-50/60 p-2.5 text-sm" dir="auto">
              {q.expectedAnswer || (q.criteria.length ? "לפי הקריטריונים" : "—")}
              {q.acceptableAlternatives.length > 0 && (
                <div className="mt-1 text-xs text-slate-600">חלופות: {q.acceptableAlternatives.join(" / ")}</div>
              )}
              {q.partialCreditRules && <div className="mt-1 text-xs text-slate-600">ניקוד חלקי: {q.partialCreditRules}</div>}
            </div>
          </div>
        </div>

        {r.explanation && (
          <div className="text-sm">
            <span className="text-xs font-semibold text-slate-500">הסבר ה-AI לניקוד: </span>
            <span dir="auto">{r.explanation}</span>
          </div>
        )}

        {q.criteria.length > 0 ? (
          <CriteriaTable q={q} r={r} readOnly={readOnly} onAction={onAction} />
        ) : (
          <PointsRow q={q} r={r} readOnly={readOnly} onAction={onAction} />
        )}

        {r.mistakes.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {r.mistakes.map((m, i) => (
              <span key={i} className="rounded-md bg-rose-50 px-2 py-0.5 text-xs text-rose-900">
                <b>{MISTAKE_LABELS[m.category]}:</b> <span dir="ltr">{m.description}</span>
              </span>
            ))}
          </div>
        )}

        <FeedbackEditor r={r} lang={lang} readOnly={readOnly} onSave={(fb) => onAction({ type: "set_feedback", feedback: fb })} />
      </div>
    </article>
  );
}

function NumberInput({ value, max, disabled, onCommit, label }: { value: number | null; max: number; disabled: boolean; onCommit: (v: number | null) => void; label: string }) {
  const [v, setV] = useState(value === null ? "" : String(value));
  useEffect(() => setV(value === null ? "" : String(value)), [value]);
  function commit() {
    const n = v.trim() === "" ? null : Number(v);
    if (n !== null && !Number.isFinite(n)) return setV(value === null ? "" : String(value));
    if (n === value) return;
    onCommit(n);
  }
  return (
    <input
      type="number"
      min={0}
      max={max}
      step="any"
      aria-label={label}
      className={`${inputBase} w-20`}
      disabled={disabled}
      value={v}
      onChange={(e) => setV(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
    />
  );
}

function PointsRow({ q, r, readOnly, onAction }: { q: RubricQuestion; r: QuestionResult; readOnly: boolean; onAction: (a: ReviewAction) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg bg-slate-50 px-3 py-2 text-sm">
      <span className="text-slate-500">הצעת AI:</span>
      <b className="ltr">{r.aiPoints === null ? "אין" : fmt(r.aiPoints)}</b>
      <span className="mx-2 text-slate-300">|</span>
      <span className="text-slate-500">ניקוד מורה:</span>
      <NumberInput label="ניקוד מורה" value={r.teacherPoints} max={q.maxPoints} disabled={readOnly} onCommit={(v) => onAction({ type: "set_points", points: v })} />
      <DecisionButtons r={r} readOnly={readOnly} onAction={onAction} />
    </div>
  );
}

function CriteriaTable({ q, r, readOnly, onAction }: { q: RubricQuestion; r: QuestionResult; readOnly: boolean; onAction: (a: ReviewAction) => void }) {
  return (
    <div className="rounded-lg bg-slate-50 p-3">
      <table className="w-full text-sm">
        <thead className="text-right text-xs text-slate-500">
          <tr>
            <th className="px-2 pb-1">קריטריון</th>
            <th className="px-2 pb-1">מקס׳</th>
            <th className="px-2 pb-1">הצעת AI</th>
            <th className="px-2 pb-1">ניקוד מורה</th>
            <th className="px-2 pb-1">הסבר</th>
          </tr>
        </thead>
        <tbody>
          {q.criteria.map((c) => {
            const ai = r.aiCriteria.find((x) => x.criterionId === c.id);
            return (
              <tr key={c.id} className="border-t border-slate-200 align-top">
                <td className="px-2 py-1.5 font-medium" dir="auto">{c.name}</td>
                <td className="ltr px-2 py-1.5 text-right">{fmt(c.maxPoints)}</td>
                <td className="ltr px-2 py-1.5 text-right">{ai?.aiPoints === null || ai === undefined ? "—" : fmt(ai.aiPoints)}</td>
                <td className="py-1">
                  <NumberInput
                    label={`ניקוד מורה ל${c.name}`}
                    value={r.teacherCriteria?.[c.id] ?? null}
                    max={c.maxPoints}
                    disabled={readOnly}
                    onCommit={(v) => onAction({ type: "set_criterion", criterionId: c.id, points: v })}
                  />
                </td>
                <td className="py-1.5 text-xs text-slate-600" dir="auto">{ai?.explanation}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <DecisionButtons r={r} readOnly={readOnly} onAction={onAction} />
      </div>
    </div>
  );
}

function DecisionButtons({ r, readOnly, onAction }: { r: QuestionResult; readOnly: boolean; onAction: (a: ReviewAction) => void }) {
  if (readOnly) return null;
  return (
    <div className="ms-auto flex flex-wrap gap-1">
      {r.aiPoints !== null && r.decision !== "accepted" && r.teacherPoints === null && !r.teacherCriteria && (
        <Button size="sm" variant="primary" onClick={() => onAction({ type: "accept" })}>
          ✓ אישור ההצעה
        </Button>
      )}
      {r.decision !== "rejected" && r.aiPoints !== null && (
        <Button size="sm" variant="ghost" onClick={() => onAction({ type: "reject" })}>
          דחיית ההצעה
        </Button>
      )}
      {r.decision !== "manual" && (
        <Button size="sm" variant="ghost" onClick={() => onAction({ type: "mark_manual" })}>
          סימון לבדיקה ידנית
        </Button>
      )}
      {r.decision !== "pending" && (
        <Button size="sm" variant="ghost" onClick={() => onAction({ type: "reset" })}>
          איפוס
        </Button>
      )}
    </div>
  );
}

function FeedbackEditor({ r, lang, readOnly, onSave }: { r: QuestionResult; lang: FeedbackLanguage; readOnly: boolean; onSave: (fb: LocalizedText | null) => void }) {
  const fb = effectiveFeedback(r);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<LocalizedText>(fb);
  const langs = lang === "both" ? (["en", "he"] as const) : ([lang] as const);

  if (editing) {
    return (
      <div className="space-y-2 rounded-lg border border-indigo-200 p-3">
        {langs.map((l) => (
          <label key={l} className="block">
            <span className="mb-1 block text-xs font-semibold text-slate-500">משוב לתלמיד ({l === "en" ? "אנגלית" : "עברית"})</span>
            <textarea
              className={`${inputClass} min-h-16`}
              dir={l === "en" ? "ltr" : "rtl"}
              value={draft[l] ?? ""}
              onChange={(e) => setDraft({ ...draft, [l]: e.target.value })}
            />
          </label>
        ))}
        <div className="flex gap-2">
          <Button size="sm" variant="primary" onClick={() => (onSave(draft), setEditing(false))}>
            שמירה
          </Button>
          {r.teacherFeedback && (
            <Button size="sm" variant="ghost" onClick={() => (onSave(null), setEditing(false))}>
              חזרה למשוב ה-AI
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
            ביטול
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-slate-100 bg-sky-50/40 p-3">
      <div className="mb-1 flex items-center gap-2 text-xs font-semibold text-slate-500">
        משוב לתלמיד {r.teacherFeedback ? <Badge tone="indigo">נערך ע״י המורה</Badge> : <Badge>הצעת AI</Badge>}
        {!readOnly && (
          <button className="ms-auto text-indigo-800 hover:underline" onClick={() => (setDraft(fb), setEditing(true))}>
            עריכה
          </button>
        )}
      </div>
      {langs.map((l) =>
        fb[l] ? (
          <p key={l} className="text-sm" dir={l === "en" ? "ltr" : "rtl"}>
            {fb[l]}
          </p>
        ) : null,
      )}
      {!fb.en && !fb.he && <p className="text-sm text-slate-400">אין משוב</p>}
    </div>
  );
}
