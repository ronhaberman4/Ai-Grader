"use client";

import { useState } from "react";
import type { FeedbackLanguage, LocalizedText, OverallFeedback, Submission } from "@/lib/types";
import { Badge, Button, inputClass } from "./ui";

export const OVERALL_SECTIONS: { key: keyof OverallFeedback; label: string; en: string }[] = [
  { key: "strengths", label: "חוזקות עיקריות", en: "Main strengths" },
  { key: "improvements", label: "תחומים לשיפור", en: "Areas for improvement" },
  { key: "keyMistakes", label: "טעויות חשובות והסבר", en: "Important mistakes" },
  { key: "recommendations", label: "המלצות מעשיות", en: "Recommendations" },
];

const toLines = (items: LocalizedText[], l: "en" | "he") => items.map((i) => i[l] ?? "").join("\n");

function fromLines(en: string, he: string, lang: FeedbackLanguage): LocalizedText[] {
  const e = en.split("\n").map((s) => s.trim());
  const h = he.split("\n").map((s) => s.trim());
  const n = Math.max(lang === "he" ? 0 : e.length, lang === "en" ? 0 : h.length);
  const out: LocalizedText[] = [];
  for (let i = 0; i < n; i++) {
    const item = { en: lang === "he" ? null : e[i] || null, he: lang === "en" ? null : h[i] || null };
    if (item.en || item.he) out.push(item);
  }
  return out;
}

export function OverallEditor({
  sub,
  lang,
  readOnly,
  onSave,
}: {
  sub: Submission;
  lang: FeedbackLanguage;
  readOnly: boolean;
  onSave: (o: OverallFeedback | null) => Promise<unknown>;
}) {
  const overall = sub.teacherOverall ?? sub.overall;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Record<string, { en: string; he: string }>>({});
  const langs = lang === "both" ? (["en", "he"] as const) : ([lang] as const);
  if (!overall) return null;

  function start() {
    const d: Record<string, { en: string; he: string }> = {};
    for (const s of OVERALL_SECTIONS) d[s.key] = { en: toLines(overall![s.key], "en"), he: toLines(overall![s.key], "he") };
    setDraft(d);
    setEditing(true);
  }

  async function save() {
    const o = {} as OverallFeedback;
    for (const s of OVERALL_SECTIONS) o[s.key] = fromLines(draft[s.key].en, draft[s.key].he, lang);
    await onSave(o);
    setEditing(false);
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="mb-3 flex items-center gap-2">
        <h3 className="font-semibold">משוב כללי לתלמיד</h3>
        {sub.teacherOverall ? <Badge tone="indigo">נערך ע״י המורה</Badge> : <Badge>הצעת AI</Badge>}
        {!readOnly && !editing && (
          <button className="ms-auto text-sm text-indigo-800 hover:underline" onClick={start}>
            עריכה
          </button>
        )}
      </div>
      {editing ? (
        <div className="space-y-3">
          <p className="text-xs text-slate-500">פריט אחד בכל שורה{lang === "both" ? " — השורות באנגלית ובעברית מתאימות זו לזו" : ""}.</p>
          {OVERALL_SECTIONS.map((s) => (
            <div key={s.key}>
              <div className="mb-1 text-sm font-medium">{s.label}</div>
              <div className={`grid gap-2 ${langs.length > 1 ? "md:grid-cols-2" : ""}`}>
                {langs.map((l) => (
                  <textarea
                    key={l}
                    className={`${inputClass} min-h-20`}
                    dir={l === "en" ? "ltr" : "rtl"}
                    value={draft[s.key][l]}
                    onChange={(e) => setDraft({ ...draft, [s.key]: { ...draft[s.key], [l]: e.target.value } })}
                  />
                ))}
              </div>
            </div>
          ))}
          <div className="flex gap-2">
            <Button variant="primary" size="sm" onClick={save}>
              שמירה
            </Button>
            {sub.teacherOverall && (
              <Button size="sm" variant="ghost" onClick={async () => (await onSave(null), setEditing(false))}>
                חזרה להצעת ה-AI
              </Button>
            )}
            <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
              ביטול
            </Button>
          </div>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {OVERALL_SECTIONS.map((s) => (
            <div key={s.key}>
              <div className="mb-1 text-sm font-medium text-slate-600">{s.label}</div>
              <ul className="list-inside list-disc space-y-1 text-sm">
                {overall[s.key].map((item, i) => (
                  <li key={i}>
                    {langs.map((l) =>
                      item[l] ? (
                        <span key={l} className="block" dir={l === "en" ? "ltr" : "rtl"}>
                          {item[l]}
                        </span>
                      ) : null,
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
