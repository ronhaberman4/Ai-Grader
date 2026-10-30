import { route, readJson } from "@/lib/api";
import * as db from "@/lib/db";
import { SessionSettingsSchema } from "@/lib/types";

export const dynamic = "force-dynamic";

export const GET = route(async () => ({ sessions: db.listSessions() }));

export const POST = route(async (req) => {
  const settings = SessionSettingsSchema.parse(await readJson(req));
  return { session: db.createSession(settings) };
});
