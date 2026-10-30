"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/client/api";
import { Alert } from "./ui";

export function AiStatusBanner() {
  const [configured, setConfigured] = useState<boolean | null>(null);
  useEffect(() => {
    api<{ aiConfigured: boolean }>("/api/status")
      .then((r) => setConfigured(r.aiConfigured))
      .catch(() => setConfigured(null));
  }, []);
  if (configured !== false) return null;
  return (
    <Alert tone="warning" title="עדיין לא הוגדר מפתח OpenAI">
      כדי שה-AI יוכל לבדוק מבחנים, יש ליצור מפתח ב-
      <a className="underline ltr" href="https://platform.openai.com/api-keys" target="_blank" rel="noreferrer">
        platform.openai.com/api-keys
      </a>
      , להוסיף אותו לקובץ <code className="ltr">.env.local</code> בשורה <code className="ltr">OPENAI_API_KEY=sk-...</code> ולהפעיל מחדש את
      האתר. ראו הוראות בקובץ README.
    </Alert>
  );
}
