"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Button, ErrorText, Field, inputClass } from "@/components/ui";

function LoginForm() {
  const params = useSearchParams();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    if (res.ok) {
      const next = params.get("next");
      window.location.href = next && next.startsWith("/") ? next : "/";
    } else {
      setError((await res.json().catch(() => ({}))).error ?? "שגיאה");
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submit} className="mx-auto mt-24 max-w-sm space-y-4 rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
      <div className="text-center">
        <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-xl bg-indigo-700 text-xl text-white">✓</div>
        <h1 className="text-xl font-bold">בודק מבחנים AI</h1>
        <p className="mt-1 text-sm text-slate-500">כניסה למורה</p>
      </div>
      <Field label="סיסמה">
        <input type="password" autoFocus className={inputClass} value={password} onChange={(e) => setPassword(e.target.value)} />
      </Field>
      <ErrorText error={error} />
      <Button type="submit" variant="primary" className="w-full" loading={loading}>
        כניסה
      </Button>
    </form>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
