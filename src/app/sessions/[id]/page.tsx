"use client";

import Link from "next/link";
import { use, useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AiStatusBanner } from "@/components/AiStatusBanner";
import { AnalysisPanel } from "@/components/AnalysisPanel";
import { RubricStep } from "@/components/RubricStep";
import { SettingsForm } from "@/components/SettingsForm";
import { ReviewPanel, UploadPanel } from "@/components/SubmissionsPanel";
import { Badge, Button, Card, ErrorText, Modal, Spinner } from "@/components/ui";
import { api } from "@/lib/client/api";
import { ASSESSMENT_TYPE_LABELS, LANGUAGE_LABELS, STRICTNESS_LABELS, TONE_LABELS } from "@/lib/labels";
import type { GradingSession, SessionFile } from "@/lib/types";

const STEPS = [
  { key: "settings", label: "הגדרות" },
  { key: "rubric", label: "מחוון" },
  { key: "upload", label: "העלאת עבודות" },
  { key: "review", label: "בדיקה ואישור" },
  { key: "analysis", label: "דוחות וניתוח כיתתי" },
] as const;
type Step = (typeof STEPS)[number]["key"];

export default function SessionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const search = useSearchParams();
  const [session, setSession] = useState<GradingSession | null>(null);
  const [files, setFiles] = useState<SessionFile[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await api<{ session: GradingSession; files: SessionFile[] }>(`/api/sessions/${id}`);
      setSession(r.session);
      setFiles(r.files);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [id]);
  useEffect(() => {
    load();
  }, [load]);

  const requested = search.get("step") as Step | null;
  const step: Step = requested ?? (session?.rubricLockedAt ? "upload" : "rubric");
  const go = (s: Step) => router.replace(`/sessions/${id}?step=${s}`, { scroll: false });

  if (error) return <ErrorText error={error} />;
  if (!session)
    return (
      <div className="flex justify-center p-10 text-slate-400">
        <Spinner />
      </div>
    );

  async function duplicate() {
    const r = await api<{ session: GradingSession }>(`/api/sessions/${id}/duplicate`, { body: {} });
    router.push(`/sessions/${r.session.id}?step=rubric`);
  }
  async function remove() {
    await api(`/api/sessions/${id}`, { method: "DELETE" });
    router.push("/");
  }

  return (
    <div className="space-y-5">
      <AiStatusBanner />
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href="/" className="text-sm text-slate-500 hover:text-slate-800">
            → המבחנים שלי
          </Link>
          <h1 className="mt-1 text-2xl font-bold">{session.name}</h1>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-slate-500">
            {[session.className, session.subject, ASSESSMENT_TYPE_LABELS[session.assessmentType], session.cefrLevel, `ציון מקסימלי ${session.maxScore}`]
              .filter(Boolean)
              .join(" · ")}
            <Badge>{STRICTNESS_LABELS[session.strictness].label}</Badge>
            <Badge>טון: {TONE_LABELS[session.tone]}</Badge>
            <Badge>משוב: {LANGUAGE_LABELS[session.feedbackLanguage]}</Badge>
            {session.rubricLockedAt && <Badge tone="indigo">🔒 מחוון נעול</Badge>}
          </div>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="ghost" onClick={duplicate} title="יצירת מבחן חדש עם אותן הגדרות ומחוון">
            שכפול
          </Button>
          <Button size="sm" variant="danger" onClick={() => setConfirmDelete(true)}>
            מחיקה
          </Button>
        </div>
      </div>

      <nav className="no-print flex gap-1 overflow-x-auto rounded-xl bg-white p-1 ring-1 ring-slate-200" aria-label="שלבים">
        {STEPS.map((s, i) => {
          const done = (s.key === "settings") || (s.key === "rubric" && !!session.rubricLockedAt);
          return (
            <button
              key={s.key}
              onClick={() => go(s.key)}
              className={`flex flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium transition ${
                step === s.key ? "bg-indigo-700 text-white" : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              <span
                className={`grid h-5 w-5 place-items-center rounded-full text-xs ${step === s.key ? "bg-white/20" : done ? "bg-emerald-100 text-emerald-800" : "bg-slate-100"}`}
              >
                {done && step !== s.key ? "✓" : i + 1}
              </span>
              {s.label}
            </button>
          );
        })}
      </nav>

      {step === "settings" && (
        <Card title="הגדרות הבדיקה">
          <SettingsForm
            key={session.updatedAt}
            initial={session}
            locked={!!session.rubricLockedAt}
            submitLabel="שמירה"
            onSubmit={async (s) => {
              const r = await api<{ session: GradingSession }>(`/api/sessions/${id}`, { method: "PATCH", body: s });
              setSession(r.session);
            }}
          />
        </Card>
      )}
      {step === "rubric" && (
        <RubricStep session={session} files={files} onSession={setSession} onFiles={setFiles} onLocked={() => go("upload")} />
      )}
      {step === "upload" && <UploadPanel session={session} onGoRubric={() => go("rubric")} />}
      {step === "review" && <ReviewPanel session={session} />}
      {step === "analysis" && <AnalysisPanel session={session} onSession={setSession} />}

      <Modal open={confirmDelete} onClose={() => setConfirmDelete(false)} title="למחוק את המבחן?">
        <p className="text-sm text-slate-600">המבחן, המחוון, כל עבודות התלמידים והציונים יימחקו לצמיתות.</p>
        <div className="mt-5 flex gap-2">
          <Button variant="danger" onClick={remove}>
            מחיקה לצמיתות
          </Button>
          <Button onClick={() => setConfirmDelete(false)}>ביטול</Button>
        </div>
      </Modal>
    </div>
  );
}
