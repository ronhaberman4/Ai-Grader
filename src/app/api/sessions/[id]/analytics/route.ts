import { route } from "@/lib/api";
import { sessionCost } from "@/lib/db";
import { classStats, generateInsights, mustGetSession } from "@/lib/service";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export const GET = route<{ id: string }>(async (_req, { id }) => ({ session: mustGetSession(id), stats: classStats(id), cost: sessionCost(id) }));

export const POST = route<{ id: string }>(async (_req, { id }) => ({ session: await generateInsights(id) }));
