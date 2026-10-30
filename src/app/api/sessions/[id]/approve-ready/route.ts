import { route } from "@/lib/api";
import * as db from "@/lib/db";
import { approveSubmission } from "@/lib/service";

/** Approves every submission whose status is "ready" (all questions resolved). */
export const POST = route<{ id: string }>(async (_req, { id }) => {
  const approved: string[] = [];
  const failed: { id: string; error: string }[] = [];
  for (const sub of db.listSubmissions(id).filter((x) => x.status === "ready")) {
    try {
      approveSubmission(sub.id);
      approved.push(sub.id);
    } catch (e) {
      failed.push({ id: sub.id, error: e instanceof Error ? e.message : String(e) });
    }
  }
  return { approved, failed };
});
