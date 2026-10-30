"use client";

import { useState } from "react";
import {
  ASSESSMENT_TYPE_LABELS,
  LANGUAGE_LABELS,
  STRICTNESS_LABELS,
  TONE_LABELS,
} from "@/lib/labels";
import {
  ASSESSMENT_TYPES,
  CEFR_LEVELS,
  FEEDBACK_LANGUAGES,
  STRICTNESS,
  TONES,
  type SessionSettings,
} from "@/lib/types";
import { Alert, Button, ErrorText, Field, inputClass } from "./ui";

export const DEFAULT_SETTINGS: SessionSettings = {
  name: "",
  className: "",
  subject: "English",
  maxScore: 100,
  cefrLevel: "B1",
  assessmentType: "mixed",
  strictness: "balanced",
  tone: "encouraging",
  feedbackLanguage: "en",
  specialInstructions: "",
};

const INSTRUCTION_EXAMPLES = [
  "בהבנת הנקרא — לא להוריד נקודות על טעויות דקדוק, אלא אם הן משנות את המשמעות.",
  "לקבל ניסוח חלופי כשהתשובה מראה הבנה נכונה.",
  "בכתיבה ברמות A1–A2 — להעדיף העברת מסר על פני טעויות דקדוק קטנות.",
  "לא להוריד על אותה טעות כתיב פעמיים.",
  "לתת ניקוד חלקי כשהתשובה כוללת חלק מהמידע הנדרש.",
];

export function SettingsForm({
  initial,
  locked = false,
  submitLabel,
  onSubmit,
}: {
  initial: SessionSettings;
  locked?: boolean;
  submitLabel: string;
  onSubmit: (s: SessionSettings) => Promise<void>;
}) {
  const [s, setS] = useState<SessionSettings>(initial);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const set = <K extends keyof SessionSettings>(k: K, v: SessionSettings[K]) => {
    setS((p) => ({ ...p, [k]: v }));
    setSaved(false);
  };

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!s.name.trim()) return setError("יש להזין שם למבחן");
    if (!(s.maxScore > 0)) return setError("ציון מקסימלי חייב להיות מספר חיובי");
    setSaving(true);
    try {
      await onSubmit(s);
      setSaved(true);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-6">
      {locked && (
        <Alert tone="info">
          המחוון נעול ולכן הגדרות הבדיקה נעולות — כך כל התלמידים נבדקים באותו אופן. ניתן לשנות רק את שם המבחן והכיתה.
        </Alert>
      )}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Field label="שם המבחן / העבודה *">
          <input className={inputClass} value={s.name} onChange={(e) => set("name", e.target.value)} placeholder="לדוגמה: Unit 4 Reading Test" />
        </Field>
        <Field label="כיתה">
          <input className={inputClass} value={s.className} onChange={(e) => set("className", e.target.value)} placeholder="לדוגמה: ט'3" />
        </Field>
        <Field label="מקצוע">
          <input className={inputClass} disabled={locked} value={s.subject} onChange={(e) => set("subject", e.target.value)} />
        </Field>
        <Field label="ציון מקסימלי *">
          <input
            type="number"
            min={1}
            step="any"
            className={inputClass}
            disabled={locked}
            value={Number.isNaN(s.maxScore) ? "" : s.maxScore}
            onChange={(e) => set("maxScore", e.target.valueAsNumber)}
          />
        </Field>
        <Field label="רמת CEFR">
          <select className={inputClass} disabled={locked} value={s.cefrLevel} onChange={(e) => set("cefrLevel", e.target.value as SessionSettings["cefrLevel"])}>
            {CEFR_LEVELS.map((l) => (
              <option key={l}>{l}</option>
            ))}
          </select>
        </Field>
        <Field label="סוג ההערכה">
          <select
            className={inputClass}
            disabled={locked}
            value={s.assessmentType}
            onChange={(e) => set("assessmentType", e.target.value as SessionSettings["assessmentType"])}
          >
            {ASSESSMENT_TYPES.map((t) => (
              <option key={t} value={t}>
                {ASSESSMENT_TYPE_LABELS[t]}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <fieldset disabled={locked}>
        <legend className="mb-1 text-sm font-medium text-slate-700">רמת קפדנות בבדיקה</legend>
        <p className="mb-2 text-xs text-slate-500">משפיעה על הניקוד בלבד — לא על סגנון המשוב. המחוון תמיד גובר על רמת הקפדנות.</p>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {STRICTNESS.map((k) => (
            <OptionCard key={k} checked={s.strictness === k} onChange={() => set("strictness", k)} name="strictness" title={STRICTNESS_LABELS[k].label}>
              {STRICTNESS_LABELS[k].description}
            </OptionCard>
          ))}
        </div>
      </fieldset>

      <div className="grid gap-6 lg:grid-cols-2">
        <fieldset disabled={locked}>
          <legend className="mb-1 text-sm font-medium text-slate-700">טון המשוב לתלמיד</legend>
          <p className="mb-2 text-xs text-slate-500">משפיע על הניסוח בלבד — לא על הציון.</p>
          <div className="flex flex-wrap gap-2">
            {TONES.map((t) => (
              <Chip key={t} checked={s.tone === t} onChange={() => set("tone", t)} name="tone">
                {TONE_LABELS[t]}
              </Chip>
            ))}
          </div>
        </fieldset>
        <fieldset disabled={locked}>
          <legend className="mb-1 text-sm font-medium text-slate-700">שפת המשוב</legend>
          <p className="mb-2 text-xs text-slate-500">באנגלית המשוב מותאם לרמת ה-CEFR של הכיתה.</p>
          <div className="flex flex-wrap gap-2">
            {FEEDBACK_LANGUAGES.map((l) => (
              <Chip key={l} checked={s.feedbackLanguage === l} onChange={() => set("feedbackLanguage", l)} name="lang">
                {LANGUAGE_LABELS[l]}
              </Chip>
            ))}
          </div>
        </fieldset>
      </div>

      <Field label="הנחיות בדיקה מיוחדות" hint="ההנחיות ייכללו במחוון הנעול ויחולו על כל התלמידים.">
        <textarea
          className={`${inputClass} min-h-28`}
          disabled={locked}
          value={s.specialInstructions}
          onChange={(e) => set("specialInstructions", e.target.value)}
          placeholder="כתבו כאן כללים נוספים לבדיקה…"
        />
      </Field>
      {!locked && (
        <div className="flex flex-wrap gap-2">
          <span className="text-xs text-slate-500">הוספה מהירה:</span>
          {INSTRUCTION_EXAMPLES.map((ex) => (
            <button
              type="button"
              key={ex}
              onClick={() => set("specialInstructions", (s.specialInstructions.trim() ? s.specialInstructions.trim() + "\n" : "") + ex)}
              className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs text-slate-700 hover:bg-slate-100"
            >
              + {ex}
            </button>
          ))}
        </div>
      )}

      <ErrorText error={error} />
      <div className="flex items-center gap-3">
        <Button type="submit" variant="primary" loading={saving}>
          {submitLabel}
        </Button>
        {saved && <span className="text-sm text-emerald-700">✓ נשמר</span>}
      </div>
    </form>
  );
}

function OptionCard({ checked, onChange, name, title, children }: { checked: boolean; onChange: () => void; name: string; title: string; children: React.ReactNode }) {
  return (
    <label
      className={`cursor-pointer rounded-lg border p-3 transition ${checked ? "border-indigo-600 bg-indigo-50 ring-1 ring-indigo-600" : "border-slate-200 bg-white hover:border-slate-300"}`}
    >
      <input type="radio" name={name} checked={checked} onChange={onChange} className="sr-only" />
      <div className="text-sm font-semibold">{title}</div>
      <div className="mt-0.5 text-xs text-slate-600">{children}</div>
    </label>
  );
}

function Chip({ checked, onChange, name, children }: { checked: boolean; onChange: () => void; name: string; children: React.ReactNode }) {
  return (
    <label
      className={`cursor-pointer rounded-full border px-4 py-1.5 text-sm transition ${checked ? "border-indigo-600 bg-indigo-700 text-white" : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"}`}
    >
      <input type="radio" name={name} checked={checked} onChange={onChange} className="sr-only" />
      {children}
    </label>
  );
}
