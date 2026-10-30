"use client";

import Link from "next/link";
import { use, useEffect, useRef, useState } from "react";
import { StudentReport } from "@/components/StudentReport";
import { Alert, Button, Empty, ErrorText, Spinner } from "@/components/ui";
import { api } from "@/lib/client/api";
import { exportToPdf } from "@/lib/client/pdf";
import type { GradingSession, Submission } from "@/lib/types";

/** All approved student reports, exported as one PDF (each student on a new page). */
export default function AllReportsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [data, setData] = useState<{ session: GradingSession; submissions: Submission[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<string | null>(null);
  const refs = useRef<(HTMLDivElement | null)[]>([]);

  useEffect(() => {
    api<{ session: GradingSession; submissions: Submission[] }>(`/api/sessions/${id}/submissions`)
      .then(setData)
      .catch((e) => setError(e.message));
  }, [id]);

  if (error) return <ErrorText error={error} />;
  if (!data)
    return (
      <div className="flex justify-center p-10 text-slate-400">
        <Spinner />
      </div>
    );
  const approved = data.submissions
    .filter((s) => s.status === "approved")
    .sort((a, b) => a.studentName.localeCompare(b.studentName, "he"));

  async function downloadAll() {
    setProgress("מכין PDF…");
    try {
      await exportToPdf(refs.current.filter(Boolean) as HTMLDivElement[], `${data!.session.name} - דוחות.pdf`);
    } catch (e) {
      setError("יצירת ה-PDF נכשלה: " + (e as Error).message);
    } finally {
      setProgress(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="no-print flex flex-wrap items-center justify-between gap-2">
        <Link href={`/sessions/${id}?step=analysis`} className="text-sm text-slate-500 hover:text-slate-800">
          → חזרה ל{data.session.name}
        </Link>
        <Button variant="primary" loading={!!progress} disabled={!approved.length} onClick={downloadAll}>
          ⬇ הורדת כל הדוחות ({approved.length}) כקובץ PDF אחד
        </Button>
      </div>
      {data.submissions.length > approved.length && (
        <Alert tone="info">{data.submissions.length - approved.length} עבודות עוד לא אושרו ולכן אינן כלולות.</Alert>
      )}
      {approved.length === 0 ? (
        <Empty>אין עדיין עבודות מאושרות.</Empty>
      ) : (
        <div className="space-y-6 overflow-x-auto rounded-xl bg-slate-200 p-4">
          {approved.map((s, i) => (
            <div key={s.id} className="mx-auto w-fit shadow-lg" style={{ breakAfter: "page" }}>
              <StudentReport ref={(el) => { refs.current[i] = el; }} session={data.session} sub={s} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
