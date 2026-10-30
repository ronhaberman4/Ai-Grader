"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AiStatusBanner } from "@/components/AiStatusBanner";
import { Badge, ButtonLink, Empty, ErrorText, Spinner } from "@/components/ui";
import { api } from "@/lib/client/api";
import type { SessionSummary } from "@/lib/db";
import { ASSESSMENT_TYPE_LABELS } from "@/lib/labels";

export default function Home() {
  const [sessions, setSessions] = useState<SessionSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<{ sessions: SessionSummary[] }>("/api/sessions")
      .then((r) => setSessions(r.sessions))
      .catch((e) => setError(e.message));
  }, []);

  return (
    <div className="space-y-6">
      <AiStatusBanner />
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">המבחנים שלי</h1>
          <p className="mt-1 text-sm text-slate-500">כל מבחן הוא סבב בדיקה אחד: מחוון נעול אחד שחל על כל התלמידים.</p>
        </div>
        <ButtonLink href="/sessions/new" variant="primary">
          + מבחן חדש
        </ButtonLink>
      </div>

      <Workflow />

      <ErrorText error={error} />
      {sessions === null && !error && (
        <div className="flex justify-center p-10 text-slate-400">
          <Spinner />
        </div>
      )}
      {sessions?.length === 0 && <Empty>עוד אין מבחנים. לחצו על &quot;מבחן חדש&quot; כדי להתחיל.</Empty>}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {sessions?.map((s) => (
          <Link
            key={s.id}
            href={`/sessions/${s.id}`}
            className="group rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-indigo-300 hover:shadow"
          >
            <div className="flex items-start justify-between gap-2">
              <h2 className="font-semibold group-hover:text-indigo-800">{s.name}</h2>
              {s.rubricLockedAt ? <Badge tone="indigo">🔒 מחוון נעול</Badge> : <Badge>טיוטה</Badge>}
            </div>
            <div className="mt-1 text-sm text-slate-500">
              {[s.className, s.subject, ASSESSMENT_TYPE_LABELS[s.assessmentType], s.cefrLevel].filter(Boolean).join(" · ")}
            </div>
            <div className="mt-4 flex flex-wrap gap-3 text-sm">
              <span>{s.submissionCount} עבודות</span>
              {s.needsReviewCount > 0 && <Badge tone="amber">{s.needsReviewCount} דורשות בדיקה</Badge>}
              {s.approvedCount > 0 && <Badge tone="green">{s.approvedCount} מאושרות</Badge>}
            </div>
            {s.submissionCount > 0 && (
              <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-100">
                <div className="h-full bg-emerald-600" style={{ width: `${(s.approvedCount / s.submissionCount) * 100}%` }} />
              </div>
            )}
          </Link>
        ))}
      </div>
    </div>
  );
}

function Workflow() {
  const steps = ["יצירת מבחן", "העלאת מחוון ונעילה", "העלאת עבודות", "בדיקה ועריכה", "אישור ודוחות"];
  return (
    <ol className="grid grid-cols-2 gap-2 sm:grid-cols-5">
      {steps.map((s, i) => (
        <li key={s} className="flex items-center gap-2 rounded-lg bg-white px-3 py-2 text-sm text-slate-600 ring-1 ring-slate-200">
          <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-indigo-50 text-xs font-semibold text-indigo-800">{i + 1}</span>
          {s}
        </li>
      ))}
    </ol>
  );
}
