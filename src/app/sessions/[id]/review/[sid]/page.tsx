"use client";

import Link from "next/link";
import { use, useCallback, useEffect, useState } from "react";
import { FileViewer } from "@/components/FileViewer";
import { OverallEditor } from "@/components/OverallEditor";
import { QuestionReview } from "@/components/QuestionReview";
import { Alert, Button, ButtonLink, ErrorText, Modal, Spinner, StatusBadge, fmt, inputClass, inputBase } from "@/components/ui";
import { api } from "@/lib/client/api";
import { computeTotals, hasTeacherChanges, type ReviewAction } from "@/lib/scoring";
import type { GradingSession, Submission, SubmissionStatus } from "@/lib/types";

type Sibling = { id: string; studentName: string; status: SubmissionStatus };

export default function ReviewPage({ params }: { params: Promise<{ id: string; sid: string }> }) {
  const { id, sid } = use(params);
  const [sub, setSub] = useState<Submission | null>(null);
  const [session, setSession] = useState<GradingSession | null>(null);
  const [siblings, setSiblings] = useState<Sibling[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [regradeOpen, setRegradeOpen] = useState(false);
  const [onlyFlagged, setOnlyFlagged] = useState(false);
  const [name, setName] = useState("");
  const [comment, setComment] = useState("");

  const load = useCallback(async () => {
    try {
      const r = await api<{ submission: Submission; session: GradingSession; siblings: Sibling[] }>(`/api/submissions/${sid}`);
      setSub(r.submission);
      setSession(r.session);
      setSiblings(r.siblings);
      setName(r.submission.studentName);
      setComment(r.submission.teacherComment);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [sid]);
  useEffect(() => {
    load();
  }, [load]);
  useEffect(() => {
    if (sub?.status !== "processing" && sub?.status !== "uploaded") return;
    const t = setInterval(load, 2500);
    return () => clearInterval(t);
  }, [sub?.status, load]);

  async function run(key: string, fn: () => Promise<{ submission?: Submission } | unknown>) {
    setBusy(key);
    setError(null);
    try {
      const r = (await fn()) as { submission?: Submission };
      if (r?.submission) setSub(r.submission);
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    } finally {
      setBusy(null);
    }
  }

  const review = (questionId: string, action: ReviewAction) =>
    run("q-" + questionId, () => api(`/api/submissions/${sid}/review`, { body: { questionId, action } }));

  if (error && !sub) return <ErrorText error={error} />;
  if (!sub || !session)
    return (
      <div className="flex justify-center p-10 text-slate-400">
        <Spinner />
      </div>
    );

  const rubric = session.rubric!;
  const approved = sub.status === "approved";
  const totals = sub.results ? computeTotals(rubric, sub.results, session.maxScore) : null;
  const idx = siblings.findIndex((s) => s.id === sid);
  const prev = idx > 0 ? siblings[idx - 1] : null;
  const next = idx >= 0 && idx < siblings.length - 1 ? siblings[idx + 1] : null;
  const nextToReview = siblings.slice(idx + 1).find((s) => s.status === "needs_review" || s.status === "ready") ??
    siblings.slice(0, idx).find((s) => s.status === "needs_review" || s.status === "ready");

  async function approve() {
    const ok = await run("approve", () => api(`/api/submissions/${sid}/approve`, { body: {} }));
    if (ok) load();
  }

  async function regrade(overwrite: boolean) {
    setRegradeOpen(false);
    await run("regrade", () =>
      api(`/api/submissions/${sid}/grade`, { body: overwrite ? { overwriteTeacherChanges: true, confirm: "overwrite" } : {} }),
    );
    load();
  }

  const shownQuestions = rubric.questions.filter((q) => {
    if (!onlyFlagged) return true;
    const r = sub.results?.find((x) => x.questionId === q.id);
    return r && r.needsReview;
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <Link href={`/sessions/${id}?step=review`} className="text-slate-500 hover:text-slate-800">
          → חזרה ל{session.name}
        </Link>
        <div className="flex items-center gap-2">
          {prev && (
            <ButtonLink href={`/sessions/${id}/review/${prev.id}`} className="!py-1">
              → <span dir="auto">{prev.studentName || "הקודם"}</span>
            </ButtonLink>
          )}
          <span className="text-slate-500">
            {idx + 1} מתוך {siblings.length}
          </span>
          {next && (
            <ButtonLink href={`/sessions/${id}/review/${next.id}`} className="!py-1">
              <span dir="auto">{next.studentName || "הבא"}</span> ←
            </ButtonLink>
          )}
        </div>
      </div>

      {/* Header with totals */}
      <div className="sticky top-0 z-10 rounded-xl border border-slate-200 bg-white/95 p-4 shadow-sm backdrop-blur">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <input
              className={`${inputBase} w-56 text-lg font-semibold ${!name.trim() ? "border-amber-400 bg-amber-50" : ""}`}
              dir="auto"
              value={name}
              placeholder="שם התלמיד/ה"
              onChange={(e) => setName(e.target.value)}
              onBlur={() => name !== sub.studentName && run("name", () => api(`/api/submissions/${sid}`, { method: "PATCH", body: { studentName: name } }))}
              aria-label="שם התלמיד"
            />
            <StatusBadge status={sub.status} />
          </div>
          {totals && (
            <div className="flex flex-wrap gap-4 text-sm">
              <Score label="הצעת AI" value={sub.aiTotal} max={session.maxScore} muted />
              <Score label="אחרי עריכת מורה" value={totals.currentTotal} max={session.maxScore} highlight={totals.teacherAdjusted} />
              <Score label="ציון סופי מאושר" value={sub.finalScore} max={session.maxScore} final />
            </div>
          )}
          <div className="ms-auto flex flex-wrap gap-2">
            {approved ? (
              <>
                <ButtonLink href={`/sessions/${id}/report/${sid}`} variant="primary">
                  דוח לתלמיד
                </ButtonLink>
                <Button loading={busy === "unapprove"} onClick={() => run("unapprove", () => api(`/api/submissions/${sid}/approve`, { method: "DELETE" }))}>
                  ביטול אישור
                </Button>
              </>
            ) : (
              sub.results && (
                <>
                  <Button
                    size="sm"
                    variant="ghost"
                    loading={busy === "accept-all"}
                    onClick={() => run("accept-all", () => api(`/api/submissions/${sid}/review`, { body: { acceptAllConfident: true } }))}
                  >
                    אישור כל ההצעות הוודאיות
                  </Button>
                  <Button size="sm" variant="ghost" loading={busy === "regrade"} onClick={() => setRegradeOpen(true)}>
                    בדיקה חוזרת ע״י AI
                  </Button>
                  <Button variant="success" loading={busy === "approve"} disabled={!!totals?.unresolved} onClick={approve}>
                    ✓ אישור ציון סופי
                  </Button>
                </>
              )
            )}
          </div>
        </div>
        {totals && totals.unresolved > 0 && !approved && (
          <div className="mt-3 flex flex-wrap items-center gap-3 text-sm text-amber-800">
            ⚠ {totals.unresolved} שאלות ממתינות להחלטה שלך לפני שניתן לאשר.
            <label className="flex items-center gap-1 text-slate-600">
              <input type="checkbox" checked={onlyFlagged} onChange={(e) => setOnlyFlagged(e.target.checked)} />
              הצגת השאלות המסומנות בלבד
            </label>
          </div>
        )}
        {approved && nextToReview && (
          <div className="mt-3 text-sm">
            ✓ הציון אושר.{" "}
            <Link className="text-indigo-800 underline" href={`/sessions/${id}/review/${nextToReview.id}`}>
              לעבודה הבאה לבדיקה: <span dir="auto">{nextToReview.studentName || "ללא שם"}</span>
            </Link>
          </div>
        )}
      </div>

      <ErrorText error={error} />

      {(sub.status === "processing" || sub.status === "uploaded") && (
        <Alert tone="info">
          <span className="flex items-center gap-2">
            <Spinner /> ה-AI בודק את העבודה… הדף יתעדכן אוטומטית.
          </span>
        </Alert>
      )}
      {sub.status === "failed" && <Alert tone="error" title="הבדיקה נכשלה">{sub.error}</Alert>}
      {sub.error && sub.status !== "failed" && <Alert tone="warning">{sub.error}</Alert>}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.85fr)]">
        <div className="space-y-4">
          {sub.results &&
            shownQuestions.map((q) => {
              const r = sub.results!.find((x) => x.questionId === q.id);
              if (!r) return null;
              return (
                <QuestionReview
                  key={q.id}
                  q={q}
                  r={r}
                  lang={session.feedbackLanguage}
                  readOnly={approved}
                  busy={busy === "q-" + q.id}
                  onAction={(a) => review(q.id, a)}
                />
              );
            })}
          {sub.results && (
            <OverallEditor
              sub={sub}
              lang={session.feedbackLanguage}
              readOnly={approved}
              onSave={(overall) => run("overall", () => api(`/api/submissions/${sid}`, { method: "PATCH", body: { teacherOverall: overall } }))}
            />
          )}
          {sub.results && (
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <label className="block">
                <span className="mb-1 block text-sm font-semibold">הערת המורה (תופיע בדוח לתלמיד)</span>
                <textarea
                  className={`${inputClass} min-h-20`}
                  dir="auto"
                  disabled={approved}
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  onBlur={() =>
                    comment !== sub.teacherComment && run("comment", () => api(`/api/submissions/${sid}`, { method: "PATCH", body: { teacherComment: comment } }))
                  }
                />
              </label>
            </div>
          )}
        </div>
        <div className="lg:sticky lg:top-36 lg:self-start">
          <FileViewer files={sub.files} />
        </div>
      </div>

      <Modal open={regradeOpen} onClose={() => setRegradeOpen(false)} title="בדיקה חוזרת ע״י AI">
        <p className="text-sm text-slate-600">ה-AI יבדוק את העבודה שוב לפי אותו מחוון נעול.</p>
        {hasTeacherChanges(sub.results) ? (
          <>
            <p className="mt-2 text-sm text-slate-600">ביצעת שינויים בעבודה זו. מה לעשות איתם?</p>
            <div className="mt-5 flex flex-wrap gap-2">
              <Button variant="primary" onClick={() => regrade(false)}>
                לשמור את השינויים שלי
              </Button>
              <Button variant="danger" onClick={() => regrade(true)}>
                למחוק את השינויים שלי ולהתחיל מחדש
              </Button>
              <Button onClick={() => setRegradeOpen(false)}>ביטול</Button>
            </div>
          </>
        ) : (
          <div className="mt-5 flex gap-2">
            <Button variant="primary" onClick={() => regrade(false)}>
              בדיקה חוזרת
            </Button>
            <Button onClick={() => setRegradeOpen(false)}>ביטול</Button>
          </div>
        )}
      </Modal>
    </div>
  );

  function Score({ label, value, max, muted, highlight, final }: { label: string; value: number | null; max: number; muted?: boolean; highlight?: boolean; final?: boolean }) {
    return (
      <div className={`rounded-lg px-3 py-1.5 ${final && value !== null ? "bg-emerald-50" : "bg-slate-50"}`}>
        <div className="text-xs text-slate-500">{label}</div>
        <div className={`ltr text-right text-lg font-semibold ${muted ? "text-slate-500" : ""} ${highlight ? "text-indigo-800" : ""} ${final && value !== null ? "text-emerald-800" : ""}`}>
          {value === null ? "—" : `${fmt(value)} / ${fmt(max)}`}
        </div>
      </div>
    );
  }
}
