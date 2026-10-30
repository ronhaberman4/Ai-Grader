import { fileResponse, route } from "@/lib/api";
import * as db from "@/lib/db";
import { mustGetSession, ServiceError } from "@/lib/service";
import { readStored, removeStored } from "@/lib/storage";

export const GET = route<{ fileId: string }>(async (_req, { fileId }) => {
  const f = db.getSessionFile(fileId);
  if (!f) throw new ServiceError("קובץ לא נמצא", 404);
  return fileResponse(readStored(f), f.mime, f.filename);
});

export const DELETE = route<{ fileId: string }>(async (_req, { fileId }) => {
  const f = db.getSessionFile(fileId);
  if (!f) throw new ServiceError("קובץ לא נמצא", 404);
  if (mustGetSession(f.sessionId).rubricLockedAt) throw new ServiceError("המחוון נעול.", 409);
  db.deleteSessionFile(fileId);
  removeStored(f);
  return { ok: true };
});
