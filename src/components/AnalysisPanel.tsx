"use client";

import { useEffect, useState } from "react";
import type { ClassStats } from "@/lib/analytics";
import { api } from "@/lib/client/api";
import { AREA_LABELS, MISTAKE_LABELS } from "@/lib/labels";
import type { SessionCost } from "@/lib/db";
import { formatUsd } from "@/lib/pricing";
import type { GradingSession } from "@/lib/types";
import { Alert, Badge, Button, ButtonLink, Card, Empty, ErrorText, Spinner, Stat, fmt } from "./ui";

export function AnalysisPanel({ session, onSession }: { session: GradingSession; onSession: (s: GradingSession) => void }) {
  const [stats, setStats] = useState<ClassStats | null>(null);
  const [cost, setCost] = useState<SessionCost | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!session.rubric) return;
    api<{ stats: ClassStats; cost: SessionCost }>(`/api/sessions/${session.id}/analytics`)
      .then((r) => {
        setStats(r.stats);
        setCost(r.cost);
      })
      .catch((e) => setError(e.message));
  }, [session.id, session.rubric]);

  async function insights() {
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ session: GradingSession }>(`/api/sessions/${session.id}/analytics`, { body: {} });
      onSession(r.session);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (!session.rubric) return <Empty>אין עדיין מחוון למבחן זה.</Empty>;
  if (error && !stats) return <ErrorText error={error} />;
  if (!stats)
    return (
      <div className="flex justify-center p-10 text-slate-400">
        <Spinner />
      </div>
    );
  if (stats.count === 0)
    return <Empty>הניתוח הכיתתי מבוסס על ציונים מאושרים בלבד. אשרו לפחות עבודה אחת בשלב &quot;בדיקה ואישור&quot;.</Empty>;

  const maxBand = Math.max(...stats.distribution.map((d) => d.count), 1);

  return (
    <div className="space-y-5">
      <Card
        title="דוחות לתלמידים"
        actions={
          <>
            <ButtonLink href={`/sessions/${session.id}/reports`} variant="primary">
              ⬇ כל הדוחות כ-PDF
            </ButtonLink>
            <a href={`/api/sessions/${session.id}/export`} className="inline-flex items-center px-2 text-sm text-indigo-800 hover:underline">
              ייצוא ציונים (CSV)
            </a>
          </>
        }
      >
        <div className="flex flex-wrap gap-2">
          {stats.students.map((s) => (
            <ButtonLink key={s.submissionId} href={`/sessions/${session.id}/report/${s.submissionId}`} className="!py-1.5">
              <span dir="auto">{s.studentName}</span>
              <span className="ltr text-xs text-slate-500">{fmt(s.score)}</span>
            </ButtonLink>
          ))}
        </div>
      </Card>

      <div className="flex items-center gap-2">
        <h2 className="text-lg font-semibold">נתונים שנמדדו</h2>
        <Badge>מחושב מ-{stats.count} ציונים מאושרים</Badge>
        {stats.pendingCount > 0 && <Badge tone="amber">{stats.pendingCount} עבודות עוד לא אושרו ואינן כלולות</Badge>}
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Stat label="תלמידים שנבדקו" value={stats.count} />
        <Stat label="ממוצע" value={fmt(stats.average)} sub={`${fmt(stats.averagePercent)}%`} />
        <Stat label="חציון" value={fmt(stats.median)} />
        <Stat label="ציון גבוה ביותר" value={fmt(stats.highest)} />
        <Stat label="ציון נמוך ביותר" value={fmt(stats.lowest)} />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card title="התפלגות ציונים (באחוזים)">
          <div className="flex h-44 items-end gap-2" dir="ltr">
            {stats.distribution.map((d) => (
              <div key={d.label} className="flex flex-1 flex-col items-center gap-1">
                <span className="text-xs font-semibold">{d.count}</span>
                <div className="w-full rounded-t bg-indigo-600" style={{ height: `${(d.count / maxBand) * 120}px`, minHeight: d.count ? 4 : 0 }} />
                <span className="text-xs text-slate-500">{d.label}</span>
              </div>
            ))}
          </div>
        </Card>
        <Card title="הצלחה לפי תחום">
          <div className="space-y-3">
            {stats.areas.map((a) => (
              <Bar key={a.area} label={AREA_LABELS[a.area]} percent={a.avgPercent} extra={`${a.questionCount} שאלות`} />
            ))}
          </div>
          {stats.strongestArea && stats.weakestArea && (
            <p className="mt-4 text-sm text-slate-600">
              התחום החזק ביותר: <b>{AREA_LABELS[stats.strongestArea]}</b> · החלש ביותר: <b>{AREA_LABELS[stats.weakestArea]}</b>
            </p>
          )}
        </Card>
      </div>

      <Card title="ממוצע לפי שאלה">
        <div className="grid gap-x-8 gap-y-2 md:grid-cols-2">
          {stats.perQuestion.map((q) => (
            <Bar
              key={q.questionId}
              label={`שאלה ${q.number}`}
              percent={q.avgPercent}
              extra={`${fmt(q.avgPoints)}/${fmt(q.maxPoints)} · ${fmt(q.fullCreditRate)}% ניקוד מלא`}
            />
          ))}
        </div>
      </Card>

      <div className="grid gap-5 lg:grid-cols-3">
        <Card title="השאלות שהוחמצו הכי הרבה">
          <ol className="list-inside list-decimal space-y-1 text-sm">
            {stats.mostMissed.map((q) => (
              <li key={q.questionId}>
                שאלה <b className="ltr">{q.number}</b> — ממוצע {fmt(q.avgPercent)}% ({AREA_LABELS[q.area]})
              </li>
            ))}
          </ol>
        </Card>
        <Card title="סוגי טעויות נפוצים">
          <ul className="space-y-1 text-sm">
            {stats.mistakeCategories.length === 0 && <li className="text-slate-500">לא תועדו טעויות.</li>}
            {stats.mistakeCategories.map((m) => (
              <li key={m.category} className="flex justify-between">
                <span>{MISTAKE_LABELS[m.category]}</span>
                <span className="text-slate-500">
                  {m.count} פעמים · {m.students} תלמידים
                </span>
              </li>
            ))}
          </ul>
        </Card>
        <Card title="תלמידים שעשויים להזדקק לתמיכה">
          {stats.needsSupport.length === 0 ? (
            <p className="text-sm text-slate-500">אין תלמידים מתחת ל-60%.</p>
          ) : (
            <ul className="space-y-1 text-sm">
              {stats.needsSupport.map((s) => (
                <li key={s.submissionId}>
                  <b dir="auto">{s.studentName}</b> — {fmt(s.percent)}%
                  {s.weakQuestions.length > 0 && <span className="text-slate-500"> · קושי בשאלות {s.weakQuestions.join(", ")}</span>}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {stats.commonMistakes.length > 0 && (
        <Card title="טעויות דקדוק ואוצר מילים חוזרות">
          <ul className="grid gap-1 text-sm md:grid-cols-2" dir="ltr">
            {stats.commonMistakes
              .filter((m) => m.count > 1 || stats.count < 4)
              .slice(0, 20)
              .map((m) => (
                <li key={m.category + m.description} className="flex justify-between gap-2 rounded bg-slate-50 px-2 py-1">
                  <span>{m.description}</span>
                  <span className="whitespace-nowrap text-xs text-slate-500">
                    ×{m.count} · {MISTAKE_LABELS[m.category]}
                  </span>
                </li>
              ))}
          </ul>
        </Card>
      )}

      {cost && cost.calls > 0 && (
        <Card title="עלות ה-AI למבחן זה">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Stat label="סה״כ" value={formatUsd(cost.total)} />
            <Stat label="בניית המחוון" value={formatUsd(cost.rubric)} />
            <Stat label="בדיקת עבודות" value={formatUsd(cost.grading)} sub={stats.students.length ? `ממוצע לתלמיד ${formatUsd(cost.grading / (stats.count + stats.pendingCount || 1))}` : undefined} />
            <Stat label="תובנות כיתתיות" value={formatUsd(cost.insights)} />
          </div>
          <p className="mt-3 text-xs text-slate-500">
            הערכה לפי המחירון הרשמי של Anthropic, כולל בדיקות חוזרות. החיוב המדויק מופיע ב-console.anthropic.com בעמוד Usage.
            {cost.unpriced > 0 && ` ${cost.unpriced} קריאות לא תומחרו כי המודל אינו ברשימת המחירים.`}
          </p>
        </Card>
      )}

      <Card
        title={
          <span className="flex items-center gap-2">
            תובנות להוראה <Badge tone="blue">פרשנות AI</Badge>
          </span>
        }
        actions={
          <Button size="sm" variant={session.insights ? "secondary" : "primary"} loading={busy} onClick={insights} disabled={stats.count < 2}>
            {session.insights ? "רענון תובנות" : "✨ הפקת תובנות"}
          </Button>
        }
      >
        <ErrorText error={error} />
        {!session.insights ? (
          <p className="text-sm text-slate-500">
            {stats.count < 2 ? "נדרשות לפחות 2 עבודות מאושרות." : "ה-AI ינתח את הנתונים המצטברים (ללא שמות תלמידים) ויציע מה כדאי לחזור עליו בשיעורים הבאים."}
          </p>
        ) : (
          <div className="space-y-4">
            <Alert tone="info">
              אלה פרשנויות שנוצרו ע״י AI על סמך {session.insights.basedOnCount} עבודות מאושרות. הנתונים עצמם מופיעים למעלה.
            </Alert>
            {session.insights.insights.map((i, k) => (
              <div key={k} className="rounded-lg border border-slate-200 p-4">
                <div className="font-semibold">{i.title}</div>
                <p className="mt-1 text-sm">{i.observation}</p>
                <p className="mt-1 text-xs text-slate-500">נתונים: {i.evidence}</p>
                <p className="mt-2 text-sm text-indigo-900">💡 {i.recommendation}</p>
              </div>
            ))}
            {session.insights.reviewTopics.length > 0 && (
              <div>
                <div className="mb-1 text-sm font-semibold">נושאים לחזרה בכיתה</div>
                <div className="flex flex-wrap gap-2">
                  {session.insights.reviewTopics.map((t) => (
                    <Badge key={t} tone="indigo">
                      <span dir="auto">{t}</span>
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </Card>
    </div>
  );
}

function Bar({ label, percent, extra }: { label: string; percent: number; extra?: string }) {
  const color = percent >= 80 ? "bg-emerald-600" : percent >= 60 ? "bg-indigo-600" : "bg-amber-500";
  return (
    <div>
      <div className="mb-1 flex justify-between text-sm">
        <span>{label}</span>
        <span className="text-slate-500">
          {fmt(percent)}% {extra && <span className="text-xs">· {extra}</span>}
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-slate-100">
        <div className={`h-full ${color}`} style={{ width: `${Math.min(100, percent)}%` }} />
      </div>
    </div>
  );
}
