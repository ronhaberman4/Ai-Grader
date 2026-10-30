import { route, readJson } from "@/lib/api";
import * as db from "@/lib/db";
import { mustGetSession, updateSettings } from "@/lib/service";
import { removeScope } from "@/lib/storage";
import { SessionSettingsSchema } from "@/lib/types";

export const dynamic = "force-dynamic";

export const GET = route<{ id: string }>(async (_req, { id }) => ({
  session: mustGetSession(id),
  files: db.listSessionFiles(id),
}));

export const PATCH = route<{ id: string }>(async (req, { id }) => {
  updateSettings(id, SessionSettingsSchema.parse(await readJson(req)));
  return { session: mustGetSession(id) };
});

export const DELETE = route<{ id: string }>(async (_req, { id }) => {
  mustGetSession(id);
  for (const sub of db.listSubmissions(id)) removeScope(sub.id);
  removeScope(id);
  db.deleteSession(id);
  return { ok: true };
});
