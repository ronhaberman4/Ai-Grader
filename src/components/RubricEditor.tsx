"use client";

import { AREA_LABELS, WRITING_CATEGORY_TEMPLATE } from "@/lib/labels";
import { ASSESSMENT_AREAS, type Rubric, type RubricCriterion, type RubricQuestion } from "@/lib/types";
import { Badge, Button, fmt, inputClass, inputBase } from "./ui";

const tmpId = (p: string) => p + Math.random().toString(36).slice(2, 10);

export function emptyQuestion(number: string): RubricQuestion {
  return {
    id: tmpId("q_"),
    number,
    section: "",
    prompt: "",
    area: "reading",
    maxPoints: 0,
    expectedAnswer: "",
    acceptableAlternatives: [],
    partialCreditRules: "",
    criteria: [],
    notes: "",
  };
}

export function questionMax(q: RubricQuestion) {
  return q.criteria.length ? q.criteria.reduce((s, c) => s + (Number(c.maxPoints) || 0), 0) : Number(q.maxPoints) || 0;
}

export function RubricEditor({ rubric, onChange, maxScore }: { rubric: Rubric; onChange: (r: Rubric) => void; maxScore: number }) {
  const total = rubric.questions.reduce((s, q) => s + questionMax(q), 0);
  const update = (i: number, q: RubricQuestion) => onChange({ ...rubric, questions: rubric.questions.map((x, j) => (j === i ? q : x)) });
  const remove = (i: number) => onChange({ ...rubric, questions: rubric.questions.filter((_, j) => j !== i) });
  const move = (i: number, d: -1 | 1) => {
    const qs = [...rubric.questions];
    const j = i + d;
    if (j < 0 || j >= qs.length) return;
    [qs[i], qs[j]] = [qs[j], qs[i]];
    onChange({ ...rubric, questions: qs });
  };
  const add = (writing = false) => {
    const q = emptyQuestion(String(rubric.questions.length + 1));
    if (writing) {
      q.area = "writing";
      q.criteria = WRITING_CATEGORY_TEMPLATE.map((c) => ({ id: tmpId("c_"), name: c.name, description: c.description, maxPoints: 0 }));
    }
    onChange({ ...rubric, questions: [...rubric.questions, q] });
  };

  return (
    <div className="space-y-4">
      <TotalBar total={total} maxScore={maxScore} count={rubric.questions.length} />
      {rubric.questions.map((q, i) => (
        <QuestionEditor
          key={q.id}
          q={q}
          onChange={(nq) => update(i, nq)}
          onRemove={() => remove(i)}
          onUp={i > 0 ? () => move(i, -1) : undefined}
          onDown={i < rubric.questions.length - 1 ? () => move(i, 1) : undefined}
        />
      ))}
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => add(false)}>+ הוספת שאלה</Button>
        <Button onClick={() => add(true)}>+ הוספת משימת כתיבה (תוכן, ארגון, אוצר מילים, דקדוק, מכניקה)</Button>
      </div>
      <label className="block">
        <span className="mb-1 block text-sm font-medium text-slate-700">הנחיות כלליות במחוון (יחולו על כל השאלות)</span>
        <textarea
          className={`${inputClass} min-h-20`}
          dir="auto"
          value={rubric.generalInstructions}
          onChange={(e) => onChange({ ...rubric, generalInstructions: e.target.value })}
        />
      </label>
    </div>
  );
}

function TotalBar({ total, maxScore, count }: { total: number; maxScore: number; count: number }) {
  const ok = Math.abs(total - maxScore) < 0.001;
  return (
    <div className={`flex flex-wrap items-center justify-between gap-2 rounded-lg px-4 py-2 text-sm ${ok ? "bg-emerald-50 text-emerald-900" : "bg-amber-50 text-amber-900"}`}>
      <span>
        {count} שאלות · סכום הניקוד: <b className="ltr">{fmt(total)}</b> מתוך <b className="ltr">{fmt(maxScore)}</b>
      </span>
      {!ok && <span>⚠ הסכום חייב להיות שווה לציון המקסימלי כדי לנעול את המחוון</span>}
    </div>
  );
}

function QuestionEditor({
  q,
  onChange,
  onRemove,
  onUp,
  onDown,
}: {
  q: RubricQuestion;
  onChange: (q: RubricQuestion) => void;
  onRemove: () => void;
  onUp?: () => void;
  onDown?: () => void;
}) {
  const set = <K extends keyof RubricQuestion>(k: K, v: RubricQuestion[K]) => onChange({ ...q, [k]: v });
  const setCrit = (i: number, c: RubricCriterion) => set("criteria", q.criteria.map((x, j) => (j === i ? c : x)));

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="text-sm font-semibold text-slate-500">שאלה</span>
        <input className={`${inputBase} w-20 ltr text-center`} value={q.number} onChange={(e) => set("number", e.target.value)} aria-label="מספר שאלה" />
        <input className={`${inputBase} w-40`} dir="auto" value={q.section} onChange={(e) => set("section", e.target.value)} placeholder="פרק (לא חובה)" aria-label="פרק" />
        <select className={`${inputBase} w-36`} value={q.area} onChange={(e) => set("area", e.target.value as RubricQuestion["area"])} aria-label="תחום">
          {ASSESSMENT_AREAS.map((a) => (
            <option key={a} value={a}>
              {AREA_LABELS[a]}
            </option>
          ))}
        </select>
        <span className="text-sm text-slate-500">ניקוד:</span>
        {q.criteria.length ? (
          <Badge tone="indigo">{fmt(questionMax(q))} (סכום הקריטריונים)</Badge>
        ) : (
          <input
            type="number"
            min={0}
            step="any"
            className={`${inputBase} w-24`}
            value={Number.isNaN(q.maxPoints) ? "" : q.maxPoints}
            onChange={(e) => set("maxPoints", e.target.valueAsNumber)}
            aria-label="ניקוד מקסימלי"
          />
        )}
        <div className="ms-auto flex gap-1">
          <Button size="sm" variant="ghost" onClick={onUp} disabled={!onUp} aria-label="הזזה למעלה">
            ↑
          </Button>
          <Button size="sm" variant="ghost" onClick={onDown} disabled={!onDown} aria-label="הזזה למטה">
            ↓
          </Button>
          <Button size="sm" variant="danger" onClick={onRemove}>
            מחיקה
          </Button>
        </div>
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        <TextArea label="השאלה" value={q.prompt} onChange={(v) => set("prompt", v)} />
        <TextArea label="תשובה צפויה / תשובון" value={q.expectedAnswer} onChange={(v) => set("expectedAnswer", v)} />
        <TextArea
          label="תשובות חלופיות מקובלות (אחת בכל שורה)"
          value={q.acceptableAlternatives.join("\n")}
          onChange={(v) => set("acceptableAlternatives", v.split("\n"))}
        />
        <TextArea label="כללי ניקוד חלקי" value={q.partialCreditRules} onChange={(v) => set("partialCreditRules", v)} />
        <TextArea label="הערות / הנחיות מיוחדות לשאלה" value={q.notes} onChange={(v) => set("notes", v)} />
      </div>

      <div className="mt-3">
        <div className="mb-1 flex items-center gap-2 text-sm font-medium text-slate-700">
          קריטריונים להערכה {q.criteria.length === 0 && <span className="font-normal text-slate-500">(לא חובה — מתאים למשימות כתיבה)</span>}
        </div>
        {q.criteria.map((c, i) => (
          <div key={c.id} className="mb-2 flex flex-wrap items-center gap-2">
            <input className={`${inputBase} w-40`} dir="auto" value={c.name} onChange={(e) => setCrit(i, { ...c, name: e.target.value })} placeholder="שם הקריטריון" />
            <input
              type="number"
              min={0}
              step="any"
              className={`${inputBase} w-20`}
              value={Number.isNaN(c.maxPoints) ? "" : c.maxPoints}
              onChange={(e) => setCrit(i, { ...c, maxPoints: e.target.valueAsNumber })}
              aria-label="נקודות"
            />
            <input
              className={`${inputBase} min-w-48 flex-1`}
              dir="auto"
              value={c.description}
              onChange={(e) => setCrit(i, { ...c, description: e.target.value })}
              placeholder="תיאור"
            />
            <Button size="sm" variant="ghost" onClick={() => set("criteria", q.criteria.filter((_, j) => j !== i))} aria-label="מחיקת קריטריון">
              ✕
            </Button>
          </div>
        ))}
        <Button size="sm" variant="ghost" onClick={() => set("criteria", [...q.criteria, { id: tmpId("c_"), name: "", maxPoints: 0, description: "" }])}>
          + קריטריון
        </Button>
      </div>
    </div>
  );
}

function TextArea({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-slate-600">{label}</span>
      <textarea className={`${inputClass} min-h-16`} dir="auto" value={value} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

/** Read-only view of a locked rubric. */
export function RubricView({ rubric }: { rubric: Rubric }) {
  return (
    <div className="space-y-3">
      <div className="overflow-x-auto rounded-lg border border-slate-200">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-right text-xs text-slate-600">
            <tr>
              <th className="p-2">שאלה</th>
              <th className="p-2">תחום</th>
              <th className="p-2">ניקוד</th>
              <th className="p-2">תשובה צפויה / קריטריונים</th>
              <th className="p-2">ניקוד חלקי וחלופות</th>
            </tr>
          </thead>
          <tbody>
            {rubric.questions.map((q) => (
              <tr key={q.id} className="border-t border-slate-100 align-top">
                <td className="p-2 font-semibold">
                  <span className="ltr">{q.number}</span>
                  {q.section && <div className="text-xs font-normal text-slate-500">{q.section}</div>}
                </td>
                <td className="p-2">{AREA_LABELS[q.area]}</td>
                <td className="p-2 ltr text-right">{fmt(q.maxPoints)}</td>
                <td className="p-2" dir="auto">
                  {q.prompt && <div className="mb-1 text-xs text-slate-500">{q.prompt}</div>}
                  {q.expectedAnswer}
                  {q.criteria.length > 0 && (
                    <ul className="mt-1 space-y-0.5">
                      {q.criteria.map((c) => (
                        <li key={c.id}>
                          <b>{c.name}</b> ({fmt(c.maxPoints)}) {c.description && <span className="text-slate-500">— {c.description}</span>}
                        </li>
                      ))}
                    </ul>
                  )}
                </td>
                <td className="p-2 text-xs" dir="auto">
                  {q.partialCreditRules}
                  {q.acceptableAlternatives.length > 0 && <div className="mt-1">חלופות: {q.acceptableAlternatives.join(" / ")}</div>}
                  {q.notes && <div className="mt-1 text-slate-500">{q.notes}</div>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rubric.generalInstructions && (
        <div className="rounded-lg bg-slate-50 p-3 text-sm" dir="auto">
          <b>הנחיות כלליות: </b>
          <span className="whitespace-pre-wrap">{rubric.generalInstructions}</span>
        </div>
      )}
    </div>
  );
}
