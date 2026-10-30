import { route } from "@/lib/api";
import * as db from "@/lib/db";
import { STATUS_LABELS } from "@/lib/labels";
import { computeTotals, finalPoints } from "@/lib/scoring";
import { mustGetSession, ServiceError } from "@/lib/service";

export const dynamic = "force-dynamic";

const cell = (v: unknown) => {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export const GET = route<{ id: string }>(async (_req, { id }) => {
  const s = mustGetSession(id);
  if (!s.rubric) throw new ServiceError("אין מחוון");
  const rubric = s.rubric;
  const header = ["תלמיד", "סטטוס", "ציון סופי", "הצעת AI", "אחוז", ...rubric.questions.map((q) => `שאלה ${q.number} (${q.maxPoints})`)];
  const rows = db.listSubmissions(id).map((sub) => {
    const t = sub.results ? computeTotals(rubric, sub.results, s.maxScore) : null;
    return [
      sub.studentName,
      STATUS_LABELS[sub.status],
      sub.finalScore ?? "",
      sub.aiTotal ?? "",
      sub.finalScore !== null ? Math.round((sub.finalScore / s.maxScore) * 1000) / 10 : t ? t.percent : "",
      ...rubric.questions.map((q) => {
        const r = sub.results?.find((x) => x.questionId === q.id);
        return r ? finalPoints(r, q) ?? "" : "";
      }),
    ];
  });
  const csv = "﻿" + [header, ...rows].map((r) => r.map(cell).join(",")).join("\r\n");
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(s.name + " - ציונים.csv")}`,
    },
  });
});
