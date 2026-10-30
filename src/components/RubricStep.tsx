"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/client/api";
import { prepareImage } from "@/lib/client/resize";
import type { GradingSession, Rubric, SessionFile, SessionFileKind } from "@/lib/types";
import { FileDrop } from "./FileDrop";
import { RubricEditor, RubricView, emptyQuestion } from "./RubricEditor";
import { Alert, Badge, Button, Card, ErrorText, Modal, inputClass } from "./ui";

const KIND_LABELS: Record<SessionFileKind, string> = {
  exam: "המבחן / המטלה",
  answer_key: "תשובון",
  rubric: "מחוון",
};

export function RubricStep({
  session,
  files,
  onSession,
  onFiles,
  onLocked,
}: {
  session: GradingSession;
  files: SessionFile[];
  onSession: (s: GradingSession) => void;
  onFiles: (f: SessionFile[]) => void;
  onLocked: () => void;
}) {
  const locked = !!session.rubricLockedAt;
  const [rubric, setRubric] = useState<Rubric | null>(session.rubric);
  const [dirty, setDirty] = useState(false);
  const [pasted, setPasted] = useState(session.rubricSourceText);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmLock, setConfirmLock] = useState(false);
  const [confirmExtract, setConfirmExtract] = useState(false);

  useEffect(() => {
    if (!dirty) setRubric(session.rubric);
  }, [session.rubric, dirty]);

  async function run<T>(key: string, fn: () => Promise<T>) {
    setBusy(key);
    setError(null);
    try {
      return await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  const upload = (kind: SessionFileKind, list: File[]) =>
    run("upload-" + kind, async () => {
      const form = new FormData();
      form.set("kind", kind);
      for (const f of list) form.append("files", await prepareImage(f));
      const r = await api<{ files: SessionFile[] }>(`/api/sessions/${session.id}/files`, { form });
      onFiles([...files, ...r.files]);
    });

  const removeFile = (id: string) =>
    run("del-" + id, async () => {
      await api(`/api/session-files/${id}`, { method: "DELETE" });
      onFiles(files.filter((f) => f.id !== id));
    });

  const extract = () =>
    run("extract", async () => {
      setConfirmExtract(false);
      const r = await api<{ session: GradingSession }>(`/api/sessions/${session.id}/rubric/extract`, { body: { pastedText: pasted } });
      setDirty(false);
      setRubric(r.session.rubric);
      onSession(r.session);
    });

  const save = (opts: { dismissAiIssues?: boolean } = {}) =>
    run("save", async () => {
      const r = await api<{ session: GradingSession }>(`/api/sessions/${session.id}/rubric`, {
        method: "PUT",
        body: { rubric: rubric ?? { questions: [], generalInstructions: "" }, pastedText: pasted, ...opts },
      });
      setDirty(false);
      setRubric(r.session.rubric);
      onSession(r.session);
      return r.session;
    });

  const lock = () =>
    run("lock", async () => {
      setConfirmLock(false);
      if (dirty) {
        const r = await api<{ session: GradingSession }>(`/api/sessions/${session.id}/rubric`, {
          method: "PUT",
          body: { rubric, pastedText: pasted },
        });
        setDirty(false);
        onSession(r.session);
      }
      const r = await api<{ session: GradingSession }>(`/api/sessions/${session.id}/rubric/lock`, { method: "POST" });
      onSession(r.session);
      onLocked();
    });

  const unlock = () =>
    run("unlock", async () => {
      const r = await api<{ session: GradingSession }>(`/api/sessions/${session.id}/rubric/lock`, { method: "DELETE" });
      onSession(r.session);
    });

  const change = (r: Rubric) => {
    setRubric(r);
    setDirty(true);
  };

  if (locked && session.rubric) {
    return (
      <div className="space-y-4">
        <Alert tone="success" title="🔒 המחוון נעול">
          אותו מחוון בדיוק יחול על כל התלמידים במבחן זה. ה-AI לא ישנה אותו — אם יתגלו בעיות, הן יסומנו לבדיקתך.
          <span className="ltr ms-2 text-xs text-emerald-700">#{session.rubricHash?.slice(0, 8)}</span>
        </Alert>
        <Issues session={session} />
        <Card title="המחוון הנעול" actions={<Button size="sm" variant="ghost" loading={busy === "unlock"} onClick={unlock}>פתיחת המחוון לעריכה</Button>}>
          <RubricView rubric={session.rubric} />
        </Card>
        <ErrorText error={error} />
      </div>
    );
  }

  const hasSources = files.length > 0 || pasted.trim().length > 0;

  return (
    <div className="space-y-5">
      <Card title="א. חומרי המבחן">
        <p className="mb-4 text-sm text-slate-600">
          העלו את המבחן, התשובון ו/או המחוון — גם סריקות או צילומים. אפשר גם להדביק הנחיות בדיקה כטקסט, או לבנות מחוון ידנית למטה.
        </p>
        <div className="grid gap-4 md:grid-cols-3">
          {(Object.keys(KIND_LABELS) as SessionFileKind[]).map((kind) => (
            <div key={kind}>
              <div className="mb-2 text-sm font-semibold">{KIND_LABELS[kind]}</div>
              <FileDrop compact label={busy === "upload-" + kind ? "מעלה…" : "גררו קבצים או לחצו לבחירה"} hint="PDF, DOCX, TXT, JPG, PNG" disabled={!!busy} onFiles={(f) => upload(kind, f)} />
              <ul className="mt-2 space-y-1">
                {files
                  .filter((f) => f.kind === kind)
                  .map((f) => (
                    <li key={f.id} className="flex items-center justify-between gap-2 rounded bg-slate-50 px-2 py-1 text-sm">
                      <a href={`/api/session-files/${f.id}`} target="_blank" rel="noreferrer" className="truncate text-indigo-800 hover:underline" dir="auto">
                        {f.filename}
                      </a>
                      <button className="text-xs text-slate-500 hover:text-red-700" onClick={() => removeFile(f.id)} disabled={!!busy}>
                        הסרה
                      </button>
                    </li>
                  ))}
              </ul>
            </div>
          ))}
        </div>
        <label className="mt-5 block">
          <span className="mb-1 block text-sm font-semibold">הנחיות בדיקה / מחוון כטקסט (לא חובה)</span>
          <textarea
            className={`${inputClass} min-h-28`}
            dir="auto"
            value={pasted}
            onChange={(e) => setPasted(e.target.value)}
            placeholder={"לדוגמה:\n1. (10 נק') The bus broke down — לקבל גם: the bus was broken\n2. (5 נק') happy / glad"}
          />
        </label>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Button
            variant="primary"
            loading={busy === "extract"}
            disabled={!hasSources || !!busy}
            onClick={() => (rubric?.questions.length ? setConfirmExtract(true) : extract())}
          >
            ✨ בניית מחוון מובנה בעזרת AI
          </Button>
          {busy === "extract" && <span className="text-sm text-slate-500">קורא את החומרים ובונה מחוון… (עד דקה-שתיים)</span>}
          {!rubric?.questions.length && (
            <Button variant="ghost" onClick={() => change({ questions: [emptyQuestion("1")], generalInstructions: session.specialInstructions })}>
              או: בניית מחוון ידנית
            </Button>
          )}
        </div>
      </Card>

      <ErrorText error={error} />

      {rubric && (
        <>
          <Issues session={session} onDismissAi={() => save({ dismissAiIssues: true })} />
          <Card
            title="ב. בדיקה ועריכה של המחוון"
            actions={
              <Button size="sm" variant={dirty ? "primary" : "secondary"} loading={busy === "save"} onClick={() => save()} disabled={!dirty}>
                {dirty ? "שמירת שינויים" : "✓ נשמר"}
              </Button>
            }
          >
            <RubricEditor rubric={rubric} onChange={change} maxScore={session.maxScore} />
          </Card>
          <Card title="ג. נעילת המחוון">
            <p className="mb-4 text-sm text-slate-600">
              לאחר הנעילה המחוון והגדרות הבדיקה קבועים, וכל עבודה תיבדק לפיהם בדיוק. רק אז ניתן להעלות עבודות תלמידים.
            </p>
            <Button variant="primary" size="lg" loading={busy === "lock"} onClick={() => setConfirmLock(true)} disabled={!!busy || !rubric.questions.length}>
              🔒 נעילת המחוון
            </Button>
          </Card>
        </>
      )}

      <Modal open={confirmLock} onClose={() => setConfirmLock(false)} title="לנעול את המחוון?">
        <p className="text-sm text-slate-600">
          המחוון והגדרות הבדיקה (קפדנות, טון, שפה, הנחיות מיוחדות) יינעלו ויחולו באופן זהה על כל התלמידים. לאחר שתיבדק עבודה ראשונה לא ניתן יהיה לשנות אותם.
        </p>
        <div className="mt-5 flex gap-2">
          <Button variant="primary" onClick={lock}>
            כן, לנעול
          </Button>
          <Button onClick={() => setConfirmLock(false)}>ביטול</Button>
        </div>
      </Modal>
      <Modal open={confirmExtract} onClose={() => setConfirmExtract(false)} title="לבנות את המחוון מחדש?">
        <p className="text-sm text-slate-600">המחוון הנוכחי, כולל העריכות שלך, יוחלף במחוון חדש שה-AI יבנה מהחומרים.</p>
        <div className="mt-5 flex gap-2">
          <Button variant="primary" onClick={extract}>
            כן, לבנות מחדש
          </Button>
          <Button onClick={() => setConfirmExtract(false)}>ביטול</Button>
        </div>
      </Modal>
    </div>
  );
}

function Issues({ session, onDismissAi }: { session: GradingSession; onDismissAi?: () => void }) {
  const issues = session.rubricIssues;
  if (!issues.length) return null;
  const errors = issues.filter((i) => i.severity === "error");
  const warnings = issues.filter((i) => i.severity === "warning");
  return (
    <Alert tone={errors.length ? "error" : "warning"} title={errors.length ? "יש לתקן לפני הנעילה" : "נקודות לבדיקתך"}>
      <ul className="list-inside list-disc space-y-0.5">
        {[...errors, ...warnings].map((i, k) => (
          <li key={k}>
            {i.questionNumber && <b className="ltr">שאלה {i.questionNumber}: </b>}
            {i.message} {i.source === "ai" && <Badge tone="blue">זוהה ע״י AI</Badge>}
          </li>
        ))}
      </ul>
      {onDismissAi && issues.some((i) => i.source === "ai") && (
        <button className="mt-2 text-xs underline" onClick={onDismissAi}>
          בדקתי — להסתיר את הערות ה-AI
        </button>
      )}
    </Alert>
  );
}
