"use client";

import Link from "next/link";
import { use, useEffect, useRef, useState } from "react";
import { StudentReport } from "@/components/StudentReport";
import { Alert, Button, ErrorText, Spinner } from "@/components/ui";
import { api } from "@/lib/client/api";
import { exportToPdf } from "@/lib/client/pdf";
import type { GradingSession, Submission } from "@/lib/types";

export default function ReportPage({ params }: { params: Promise<{ id: string; sid: string }> }) {
  const { id, sid } = use(params);
  const [data, setData] = useState<{ submission: Submission; session: GradingSession } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api<{ submission: Submission; session: GradingSession }>(`/api/submissions/${sid}`)
      .then(setData)
      .catch((e) => setError(e.message));
  }, [sid]);

  if (error) return <ErrorText error={error} />;
  if (!data)
    return (
      <div className="flex justify-center p-10 text-slate-400">
        <Spinner />
      </div>
    );

  const { submission: sub, session } = data;
  async function download() {
    setBusy(true);
    try {
      await exportToPdf([ref.current!], `${sub.studentName || "student"} - ${session.name}.pdf`);
    } catch (e) {
      setError("יצירת ה-PDF נכשלה: " + (e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="no-print flex flex-wrap items-center justify-between gap-2">
        <Link href={`/sessions/${id}/review/${sid}`} className="text-sm text-slate-500 hover:text-slate-800">
          → חזרה לבדיקה
        </Link>
        <div className="flex gap-2">
          <Button variant="primary" loading={busy} onClick={download} disabled={sub.status !== "approved"}>
            ⬇ הורדת PDF
          </Button>
          <Button onClick={() => window.print()} disabled={sub.status !== "approved"}>
            הדפסה
          </Button>
        </div>
      </div>
      {sub.status !== "approved" && (
        <Alert tone="warning">הדוח זמין רק לאחר אישור הציון הסופי ע״י המורה.</Alert>
      )}
      {sub.status === "approved" && (
        <div className="overflow-x-auto rounded-xl bg-slate-200 p-4">
          <div className="mx-auto w-fit shadow-lg">
            <StudentReport ref={ref} session={session} sub={sub} />
          </div>
        </div>
      )}
    </div>
  );
}
