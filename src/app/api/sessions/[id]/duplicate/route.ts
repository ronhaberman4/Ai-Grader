import { route } from "@/lib/api";
import { duplicateSession } from "@/lib/service";

export const POST = route<{ id: string }>(async (_req, { id }) => ({ session: duplicateSession(id) }));
