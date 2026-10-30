"use client";

import { useEffect, useState } from "react";
import type { SubmissionFile } from "@/lib/types";

/** Shows the student's original pages next to the grading, so the teacher can check unclear handwriting. */
export function FileViewer({ files }: { files: SubmissionFile[] }) {
  const [i, setI] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [open, setOpen] = useState(true);
  const f = files[Math.min(i, files.length - 1)];
  if (!f) return null;
  const url = `/api/submission-files/${f.id}`;

  return (
    <div className="rounded-xl border border-slate-200 bg-white">
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-3 py-2 text-sm">
        <button className="font-semibold" onClick={() => setOpen(!open)}>
          {open ? "▾" : "▸"} העבודה המקורית
        </button>
        {files.length > 1 &&
          files.map((x, k) => (
            <button
              key={x.id}
              onClick={() => setI(k)}
              className={`rounded px-2 py-0.5 text-xs ${k === i ? "bg-indigo-700 text-white" : "bg-slate-100"}`}
            >
              {k + 1}
            </button>
          ))}
        <div className="ms-auto flex items-center gap-1">
          {f.mime.startsWith("image/") && (
            <>
              <button className="rounded bg-slate-100 px-2" onClick={() => setZoom((z) => Math.max(0.5, z - 0.25))} aria-label="הקטנה">
                −
              </button>
              <button className="rounded bg-slate-100 px-2" onClick={() => setZoom((z) => Math.min(3, z + 0.25))} aria-label="הגדלה">
                +
              </button>
            </>
          )}
          <a href={url} target="_blank" rel="noreferrer" className="text-xs text-indigo-800 hover:underline">
            פתיחה בחלון חדש
          </a>
        </div>
      </div>
      {open && (
        <div className="max-h-[75vh] overflow-auto bg-slate-100">
          {f.mime === "application/pdf" ? (
            <iframe src={url} title={f.filename} className="h-[75vh] w-full" />
          ) : f.mime.startsWith("image/") ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={url} alt={f.filename} style={{ width: `${zoom * 100}%`, maxWidth: "none" }} />
          ) : (
            <TextFile url={url} />
          )}
        </div>
      )}
    </div>
  );
}

function TextFile({ url }: { url: string }) {
  const [text, setText] = useState<string | null>(null);
  useEffect(() => {
    fetch(url)
      .then((r) => (r.headers.get("content-type")?.startsWith("text/") ? r.text() : "קובץ Word — לחצו על 'פתיחה בחלון חדש' להורדה."))
      .then(setText)
      .catch(() => setText("לא ניתן להציג את הקובץ."));
  }, [url]);
  return <pre className="whitespace-pre-wrap p-4 text-sm" dir="auto">{text ?? "…"}</pre>;
}
