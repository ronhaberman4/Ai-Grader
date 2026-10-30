import { route } from "@/lib/api";
import { lockRubric, unlockRubric } from "@/lib/service";

export const POST = route<{ id: string }>(async (_req, { id }) => ({ session: lockRubric(id) }));
export const DELETE = route<{ id: string }>(async (_req, { id }) => ({ session: unlockRubric(id) }));
