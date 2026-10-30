"use client";

import { useRouter } from "next/navigation";
import { DEFAULT_SETTINGS, SettingsForm } from "@/components/SettingsForm";
import { Card } from "@/components/ui";
import { api } from "@/lib/client/api";
import type { GradingSession } from "@/lib/types";

export default function NewSessionPage() {
  const router = useRouter();
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">מבחן חדש</h1>
      <Card title="שלב 1: הגדרות הבדיקה">
        <SettingsForm
          initial={DEFAULT_SETTINGS}
          submitLabel="יצירה והמשך למחוון ←"
          onSubmit={async (s) => {
            const { session } = await api<{ session: GradingSession }>("/api/sessions", { body: s });
            router.push(`/sessions/${session.id}?step=rubric`);
          }}
        />
      </Card>
    </div>
  );
}
