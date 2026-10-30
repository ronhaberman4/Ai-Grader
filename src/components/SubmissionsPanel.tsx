"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/client/api";
import { prepareImage } from "@/lib/client/resize";
import { computeTotals } from "@/lib/scoring";
import type { GradingSession, Submission } from "@/lib/types";
import { ACCEPT, FileDrop } from "./FileDrop";
import { Alert, Badge, Button, ButtonLink, Card, Empty, ErrorText, Modal, StatusBadge, fmt, inputClass, inputBase } from "./ui";

export function useSubmissions(sessionId: string) {
  const [subs, setSubs] = useState<Submission[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const reload = useCallback(async () => {
    try {
      const r = await api<{ submissions: Submission[] }>(`/api/sessions/${sessionId}/submissions`);
      setSubs(r.submissions);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [sessionId]);
  useEffect(() => {
    reload();
  }, [reload]);
  const active = subs?.some((s) => s.status === "uploaded" || s.status === "processing");
  useEffect(() => {
    if (!active) return;
    const t = setInterval(reload, 2500);
    return () => clearInterval(t);
  }, [active, reload]);
  return { subs, setSubs, reload, error };
}

export function UploadPanel({ session, onGoRubric }: { session: GradingSession; onGoRubric: () => void }) {
  const { subs, reload, error: loadError } = useSubmissions(session.id);
  const [combine, setCombine] = useState(false);
  const [name, setName] = useState("");
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [errors, setErrors] = useState<string[]>([]);

  if (!session.rubricLockedAt) {
    return (
      <Alert tone="warning" title="יש לנעול את המחוון לפני העלאת עבודות">
        כך מובטח שכל התלמידים ייבדקו לפי אותם קריטריונים בדיוק.
        <div className="mt-2">
          <Button size="sm" onClick={onGoRubric}>
            מעבר למחוון
          </Button>
        </div>
      </Alert>
    );
  }

  async function upload(files: File[]) {
    setErrors([]);
    const groups = combine ? [files] : files.map((f) => [f]);
    setProgress({ done: 0, total: groups.length });
    const errs: string[] = [];
    for (const [i, group] of groups.entries()) {
      try {
        const form = new FormData();
        for (const f of group) form.append("files", await prepareImage(f));
        if (combine) {
          form.set("combine", "1");
          if (name.trim()) form.set("studentName", name.trim());
        }
        await api(`/api/sessions/${session.id}/submissions`, { form });
      } catch (e) {
        errs.push(`${group.map((f) => f.name).join(", ")}: ${(e as Error).message}`);
      }
      setProgress({ done: i + 1, total: groups.length });
      reload();
    }
    setErrors(errs);
    setProgress(null);
    setName("");
  }

  return (
    <div className="space-y-5">
      <Card title="העלאת עבודות תלמידים">
        <div className="mb-4 flex flex-wrap items-center gap-4 text-sm">
          <label className="flex items-center gap-2">
            <input type="radio" checked={!combine} onChange={() => setCombine(false)} />
            כל קובץ הוא תלמיד אחר (העלאה מרוכזת)
          </label>
          <label className="flex items-center gap-2">
            <input type="radio" checked={combine} onChange={() => setCombine(true)} />
            כל הקבצים הם עמודים של תלמיד אחד
          </label>
          {combine && <input className={`${inputBase} w-56`} placeholder="שם התלמיד (לא חובה)" value={name} onChange={(e) => setName(e.target.value)} />}
        </div>
        <FileDrop
          label={progress ? `מעלה ${progress.done}/${progress.total}…` : combine ? "גררו לכאן את כל העמודים של התלמיד" : "גררו לכאן עבודות — קובץ לכל תלמיד"}
          disabled={!!progress}
          onFiles={upload}
        />
        {progress && (
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100">
            <div className="h-full bg-indigo-600 transition-all" style={{ width: `${(progress.done / progress.total) * 100}%` }} />
          </div>
        )}
        <p className="mt-3 text-xs text-slate-500">
          שם התלמיד מזוהה אוטומטית משם הקובץ (למשל <span className="ltr">Noa_Levi.pdf</span>) או מהכתוב על הדף, וניתן לתקן אותו בטבלה. הבדיקה מתחילה מיד עם ההעלאה.
        </p>
        {errors.length > 0 && (
          <div className="mt-3">
            <Alert tone="error" title="חלק מהקבצים לא הועלו">
              <ul className="list-inside list-disc">
                {errors.map((e) => (
                  <li key={e}>{e}</li>
                ))}
              </ul>
            </Alert>
          </div>
        )}
      </Card>
      <ErrorText error={loadError} />
      <QueueTable session={session} subs={subs} reload={reload} />
    </div>
  );
}

function QueueTable({ session, subs, reload }: { session: GradingSession; subs: Submission[] | null; reload: () => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toDelete, setToDelete] = useState<Submission | null>(null);

  async function act(key: string, fn: () => Promise<unknown>) {
    setBusy(key);
    setError(null);
    try {
      await fn();
      await reload();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  if (!subs) return null;
  if (subs.length === 0) return <Empty>עוד לא הועלו עבודות.</Empty>;

  const counts = subs.reduce<Record<string, number>>((m, s) => ((m[s.status] = (m[s.status] ?? 0) + 1), m), {});

  return (
    <Card
      title={`תור העבודות (${subs.length})`}
      actions={
        <div className="flex flex-wrap gap-2 text-xs">
          {(counts.uploaded || counts.processing) && <Badge tone="blue">{(counts.uploaded ?? 0) + (counts.processing ?? 0)} בתהליך</Badge>}
          {counts.needs_review && <Badge tone="amber">{counts.needs_review} דורשות בדיקה</Badge>}
          {counts.ready && <Badge tone="green">{counts.ready} מוכנות לאישור</Badge>}
          {counts.failed && <Badge tone="red">{counts.failed} נכשלו</Badge>}
        </div>
      }
    >
      <ErrorText error={error} />
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-right text-xs text-slate-500">
            <tr className="border-b border-slate-100">
              <th className="p-2">תלמיד/ה</th>
              <th className="p-2">קבצים</th>
              <th className="p-2">סטטוס</th>
              <th className="p-2">הצעת AI</th>
              <th className="p-2"></th>
            </tr>
          </thead>
          <tbody>
            {subs.map((s) => (
              <tr key={s.id} className="border-b border-slate-50 align-top">
                <td className="p-2">
                  <NameInput sub={s} onSaved={reload} />
                  {s.detectedName && s.detectedName !== s.studentName && (
                    <button
                      className="mt-1 block text-xs text-indigo-700 hover:underline"
                      onClick={() => act("name-" + s.id, () => api(`/api/submissions/${s.id}`, { method: "PATCH", body: { studentName: s.detectedName } }))}
                    >
                      על הדף כתוב: <span dir="auto">{s.detectedName}</span> — להשתמש?
                    </button>
                  )}
                </td>
                <td className="p-2 text-xs text-slate-600">
                  {s.files.map((f) => (
                    <a key={f.id} href={`/api/submission-files/${f.id}`} target="_blank" rel="noreferrer" className="block max-w-48 truncate hover:underline" dir="auto">
                      {f.filename}
                    </a>
                  ))}
                </td>
                <td className="p-2">
                  <StatusBadge status={s.status} />
                  {s.error && (
                    <div className={`mt-1 max-w-72 whitespace-pre-wrap text-xs ${s.status === "failed" ? "text-red-700" : "text-amber-800"}`}>{s.error}</div>
                  )}
                </td>
                <td className="p-2 ltr text-right">{s.aiTotal !== null ? `${fmt(s.aiTotal)} / ${fmt(session.maxScore)}` : "—"}</td>
                <td className="p-2">
                  <div className="flex flex-wrap justify-end gap-1">
                    {(s.status === "needs_review" || s.status === "ready" || s.status === "approved") && (
                      <ButtonLink href={`/sessions/${session.id}/review/${s.id}`} variant={s.status === "approved" ? "secondary" : "primary"} className="!px-2.5 !py-1">
                        {s.status === "approved" ? "צפייה" : "בדיקה"}
                      </ButtonLink>
                    )}
                    {s.status === "failed" && (
                      <Button size="sm" loading={busy === "retry-" + s.id} onClick={() => act("retry-" + s.id, () => api(`/api/submissions/${s.id}/grade`, { body: {} }))}>
                        ניסיון חוזר
                      </Button>
                    )}
                    {s.status !== "processing" && s.status !== "approved" && (
                      <ReplaceFile sub={s} onDone={reload} onError={setError} />
                    )}
                    {s.status !== "processing" && (
                      <Button size="sm" variant="ghost" onClick={() => setToDelete(s)} aria-label="מחיקה">
                        🗑
                      </Button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Modal open={!!toDelete} onClose={() => setToDelete(null)} title="למחוק את העבודה?">
        <p className="text-sm text-slate-600">
          העבודה של <b>{toDelete?.studentName || "תלמיד ללא שם"}</b>, הקבצים והציונים שלה יימחקו לצמיתות.
        </p>
        <div className="mt-5 flex gap-2">
          <Button
            variant="danger"
            onClick={() => {
              const s = toDelete!;
              setToDelete(null);
              act("del-" + s.id, () => api(`/api/submissions/${s.id}`, { method: "DELETE" }));
            }}
          >
            מחיקה
          </Button>
          <Button onClick={() => setToDelete(null)}>ביטול</Button>
        </div>
      </Modal>
    </Card>
  );
}

function NameInput({ sub, onSaved }: { sub: Submission; onSaved: () => void }) {
  const [value, setValue] = useState(sub.studentName);
  useEffect(() => setValue(sub.studentName), [sub.studentName]);
  async function save() {
    if (value.trim() === sub.studentName) return;
    await api(`/api/submissions/${sub.id}`, { method: "PATCH", body: { studentName: value } });
    onSaved();
  }
  return (
    <input
      className={`${inputBase} w-44 ${!value.trim() ? "border-amber-400 bg-amber-50" : ""}`}
      dir="auto"
      value={value}
      placeholder="הזינו שם"
      onChange={(e) => setValue(e.target.value)}
      onBlur={save}
      onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
    />
  );
}

function ReplaceFile({ sub, onDone, onError }: { sub: Submission; onDone: () => void; onError: (e: string) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<"replace" | "append">("replace");
  const [busy, setBusy] = useState(false);
  async function onFiles(files: File[]) {
    setBusy(true);
    try {
      const form = new FormData();
      form.set("mode", mode);
      for (const f of files) form.append("files", await prepareImage(f));
      await api(`/api/submissions/${sub.id}/files`, { form });
      await api(`/api/submissions/${sub.id}/grade`, { body: {} });
      onDone();
    } catch (e) {
      onError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <Button size="sm" variant="ghost" loading={busy} onClick={() => (setMode("replace"), ref.current?.click())} title="החלפת הקובץ ובדיקה מחדש">
        החלפה
      </Button>
      <Button size="sm" variant="ghost" disabled={busy} onClick={() => (setMode("append"), ref.current?.click())} title="הוספת עמודים ובדיקה מחדש">
        + עמוד
      </Button>
      <input
        ref={ref}
        type="file"
        multiple
        accept={ACCEPT}
        className="hidden"
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          e.target.value = "";
          if (files.length) onFiles(files);
        }}
      />
    </>
  );
}

export function ReviewPanel({ session }: { session: GradingSession }) {
  const { subs, reload, error } = useSubmissions(session.id);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  if (!subs) return <ErrorText error={error} />;
  const graded = subs.filter((s) => s.results);
  if (graded.length === 0) return <Empty>עוד אין עבודות שנבדקו. העלו עבודות בשלב הקודם.</Empty>;
  const ready = subs.filter((s) => s.status === "ready");
  const firstToReview = subs.find((s) => s.status === "needs_review") ?? ready[0];
  const rubric = session.rubric!;

  async function approveReady() {
    setConfirm(false);
    setBusy(true);
    try {
      const r = await api<{ approved: string[]; failed: { error: string }[] }>(`/api/sessions/${session.id}/approve-ready`, { body: {} });
      setMsg(`אושרו ${r.approved.length} עבודות.` + (r.failed.length ? ` ${r.failed.length} לא אושרו: ${r.failed[0].error}` : ""));
      await reload();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {firstToReview && (
          <ButtonLink href={`/sessions/${session.id}/review/${firstToReview.id}`} variant="primary">
            התחלת בדיקה ←
          </ButtonLink>
        )}
        <Button variant="success" disabled={!ready.length} loading={busy} onClick={() => setConfirm(true)}>
          ✓ אישור כל המוכנות ({ready.length})
        </Button>
        <a href={`/api/sessions/${session.id}/export`} className="text-sm text-indigo-800 hover:underline">
          ⬇ ייצוא ציונים ל-Excel (CSV)
        </a>
      </div>
      {msg && <Alert tone="success">{msg}</Alert>}
      <Alert tone="info">
        ציוני ה-AI הם <b>הצעה בלבד</b>. ציון נכנס לדוחות ולניתוח הכיתתי רק לאחר שאישרת אותו.
      </Alert>
      <Card title="סיכום ציונים">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-right text-xs text-slate-500">
              <tr className="border-b border-slate-100">
                <th className="p-2">תלמיד/ה</th>
                <th className="p-2">סטטוס</th>
                <th className="p-2">הצעת AI</th>
                <th className="p-2">אחרי עריכת מורה</th>
                <th className="p-2">ציון סופי מאושר</th>
                <th className="p-2">ממתין להחלטה</th>
                <th className="p-2"></th>
              </tr>
            </thead>
            <tbody>
              {subs.map((s) => {
                const t = s.results ? computeTotals(rubric, s.results, session.maxScore) : null;
                return (
                  <tr key={s.id} className="border-b border-slate-50">
                    <td className="p-2 font-medium" dir="auto">
                      {s.studentName || <span className="text-amber-700">ללא שם</span>}
                    </td>
                    <td className="p-2">
                      <StatusBadge status={s.status} />
                    </td>
                    <td className="p-2 ltr text-right text-slate-600">{fmt(s.aiTotal)}</td>
                    <td className="p-2 ltr text-right">{t ? (t.teacherAdjusted ? <b>{fmt(t.currentTotal)}</b> : fmt(t.currentTotal)) : "—"}</td>
                    <td className="p-2 ltr text-right font-semibold text-emerald-800">{s.finalScore !== null ? `${fmt(s.finalScore)} / ${fmt(session.maxScore)}` : "—"}</td>
                    <td className="p-2">{t && t.unresolved > 0 ? <Badge tone="amber">{t.unresolved} שאלות</Badge> : null}</td>
                    <td className="p-2 text-left">
                      {s.results && (
                        <Link href={`/sessions/${session.id}/review/${s.id}`} className="text-indigo-800 hover:underline">
                          {s.status === "approved" ? "צפייה" : "בדיקה"} ←
                        </Link>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
      <Modal open={confirm} onClose={() => setConfirm(false)} title={`לאשר ${ready.length} עבודות?`}>
        <p className="text-sm text-slate-600">
          יאושרו רק עבודות שבהן כל השאלות נפתרו (ללא סימוני אי-ודאות פתוחים). הציונים שיאושרו הם הציונים המוצגים בעמודה &quot;אחרי עריכת מורה&quot;.
        </p>
        <div className="mt-5 flex gap-2">
          <Button variant="success" onClick={approveReady}>
            אישור
          </Button>
          <Button onClick={() => setConfirm(false)}>ביטול</Button>
        </div>
      </Modal>
    </div>
  );
}
