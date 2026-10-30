"use client";

import { useEffect, useState } from "react";
import { Alert, Badge, Button, Card, ErrorText, Field, Spinner, inputClass } from "@/components/ui";
import { api } from "@/lib/client/api";

type SettingsView = {
  apiKey: { hint: string; fromEnv: boolean } | null;
  password: { fromEnv: boolean } | null;
  model: string;
  modelFromEnv: boolean;
  modelChoices: readonly { id: string; label: string; hint: string }[];
};

export default function SettingsPage() {
  const [view, setView] = useState<SettingsView | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<SettingsView>("/api/settings").then(setView).catch((e) => setError(e.message));
  }, []);

  if (!view) return error ? <ErrorText error={error} /> : <div className="flex justify-center p-10 text-slate-400"><Spinner /></div>;

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <h1 className="text-2xl font-bold">הגדרות</h1>
      <ApiKeyCard view={view} onSaved={setView} />
      <ModelCard view={view} onSaved={setView} />
      <PasswordCard view={view} onSaved={setView} />
    </div>
  );
}

function ApiKeyCard({ view, onSaved }: { view: SettingsView; onSaved: (v: SettingsView) => void }) {
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  async function save() {
    setBusy(true);
    setError(null);
    setOk(false);
    try {
      onSaved(await api<SettingsView>("/api/settings", { method: "PUT", body: { anthropicApiKey: key } }));
      setKey("");
      setOk(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card
      title={
        <span className="flex items-center gap-2">
          1. מפתח Claude {view.apiKey ? <Badge tone="green">✓ מחובר</Badge> : <Badge tone="amber">חסר</Badge>}
        </span>
      }
    >
      {view.apiKey?.fromEnv ? (
        <Alert tone="info">המפתח מוגדר בקובץ .env.local (מסתיים ב-<span className="ltr">{view.apiKey.hint}</span>).</Alert>
      ) : (
        <div className="space-y-4">
          {view.apiKey && (
            <p className="text-sm text-slate-600">
              מפתח שמור (מסתיים ב-<span className="ltr">{view.apiKey.hint}</span>). להחלפה הדביקו מפתח חדש.
            </p>
          )}
          <ol className="list-inside list-decimal space-y-1 rounded-lg bg-slate-50 p-4 text-sm text-slate-700">
            <li>
              היכנסו ל-
              <a className="text-indigo-800 underline" href="https://console.anthropic.com/settings/keys" target="_blank" rel="noreferrer">
                console.anthropic.com
              </a>{" "}
              והירשמו (זה נפרד ממנוי claude.ai).
            </li>
            <li>בתפריט Billing טענו קרדיט (למשל 5 דולר). מומלץ לא להפעיל טעינה אוטומטית.</li>
            <li>בתפריט API Keys לחצו Create Key והעתיקו את המפתח.</li>
            <li>הדביקו אותו כאן ולחצו &quot;שמירה ובדיקה&quot;.</li>
          </ol>
          <Field label="מפתח API">
            <input
              type="password"
              className={`${inputClass} ltr text-left`}
              placeholder="sk-ant-..."
              value={key}
              onChange={(e) => setKey(e.target.value)}
              autoComplete="off"
            />
          </Field>
          <ErrorText error={error} />
          {ok && <Alert tone="success">✓ המפתח נבדק ונשמר. אפשר להתחיל לבדוק מבחנים!</Alert>}
          <Button variant="primary" loading={busy} disabled={!key.trim()} onClick={save}>
            שמירה ובדיקה
          </Button>
          <p className="text-xs text-slate-500">המפתח נשמר רק על המחשב הזה (בתיקיית data של האתר) ואינו מוצג שוב.</p>
        </div>
      )}
    </Card>
  );
}

function ModelCard({ view, onSaved }: { view: SettingsView; onSaved: (v: SettingsView) => void }) {
  const [error, setError] = useState<string | null>(null);
  async function choose(id: string) {
    setError(null);
    try {
      onSaved(await api<SettingsView>("/api/settings", { method: "PUT", body: { model: id } }));
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <Card title="2. מודל הבדיקה">
      {view.modelFromEnv ? (
        <Alert tone="info">
          המודל מוגדר בקובץ .env.local: <span className="ltr">{view.model}</span>
        </Alert>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2">
          {view.modelChoices.map((m) => (
            <button
              key={m.id}
              onClick={() => choose(m.id)}
              className={`rounded-lg border p-3 text-right transition ${view.model === m.id ? "border-indigo-600 bg-indigo-50 ring-1 ring-indigo-600" : "border-slate-200 hover:border-slate-300"}`}
            >
              <div className="font-semibold ltr text-right">{m.label}</div>
              <div className="text-xs text-slate-600">{m.hint}</div>
            </button>
          ))}
        </div>
      )}
      <p className="mt-3 text-xs text-slate-500">השינוי חל על בדיקות חדשות. מבחן שהמחוון שלו כבר נעול ממשיך להיבדק לפי אותו מחוון.</p>
      <ErrorText error={error} />
    </Card>
  );
}

function PasswordCard({ view, onSaved }: { view: SettingsView; onSaved: (v: SettingsView) => void }) {
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  async function save(value: string | null) {
    setError(null);
    setMsg(null);
    if (value !== null && value !== pw2) return setError("הסיסמאות אינן זהות.");
    try {
      onSaved(await api<SettingsView>("/api/settings", { method: "PUT", body: { appPassword: value } }));
      setPw("");
      setPw2("");
      setMsg(value === null ? "הסיסמה הוסרה." : "✓ הסיסמה נשמרה.");
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <Card
      title={
        <span className="flex items-center gap-2">
          3. סיסמת כניסה (לא חובה) {view.password ? <Badge tone="green">פעילה</Badge> : <Badge>אין סיסמה</Badge>}
        </span>
      }
    >
      {view.password?.fromEnv ? (
        <Alert tone="info">הסיסמה מוגדרת בקובץ .env.local.</Alert>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-slate-600">
            האתר פתוח רק מהמחשב הזה. סיסמה מומלצת אם אחרים משתמשים במחשב, כי יש באתר עבודות וציונים של תלמידים.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={view.password ? "סיסמה חדשה" : "סיסמה"}>
              <input type="password" className={inputClass} value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="new-password" />
            </Field>
            <Field label="הקלדה חוזרת">
              <input type="password" className={inputClass} value={pw2} onChange={(e) => setPw2(e.target.value)} autoComplete="new-password" />
            </Field>
          </div>
          <ErrorText error={error} />
          {msg && <Alert tone="success">{msg}</Alert>}
          <div className="flex gap-2">
            <Button variant="primary" disabled={!pw} onClick={() => save(pw)}>
              שמירת סיסמה
            </Button>
            {view.password && (
              <Button variant="ghost" onClick={() => save(null)}>
                הסרת הסיסמה
              </Button>
            )}
          </div>
        </div>
      )}
    </Card>
  );
}
