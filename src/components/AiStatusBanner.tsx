"use client";

import Link from "next/link";
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
    <Alert tone="warning" title="צעד אחרון: חיבור ל-Claude">
      כדי ש-Claude יוכל לבדוק מבחנים, צריך להדביק מפתח API במסך ההגדרות.{" "}
      <Link href="/settings" className="font-semibold underline">
        למסך ההגדרות ←
      </Link>
    </Alert>
  );
}
