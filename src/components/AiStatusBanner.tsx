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
    <Alert tone="warning" title="עדיין לא הוגדר מפתח API של Claude">
      כדי ש-Claude יוכל לבדוק מבחנים, יש ליצור מפתח ב-
      <a className="underline ltr" href="https://console.anthropic.com/settings/keys" target="_blank" rel="noreferrer">
        console.anthropic.com
      </a>
      , להוסיף אותו לקובץ <code className="ltr">.env.local</code> בשורה <code className="ltr">ANTHROPIC_API_KEY=sk-ant-...</code> ולהפעיל מחדש את
      האתר. ראו הוראות בקובץ README.
    </Alert>
  );
}
