import { route } from "@/lib/api";
import { approveSubmission, unapproveSubmission } from "@/lib/service";

export const POST = route<{ sid: string }>(async (_req, { sid }) => ({ submission: approveSubmission(sid) }));
export const DELETE = route<{ sid: string }>(async (_req, { sid }) => ({ submission: unapproveSubmission(sid) }));
