import { fileResponse, route } from "@/lib/api";
import * as db from "@/lib/db";
import { mustGetSubmission, ServiceError } from "@/lib/service";
import { readStored, removeStored } from "@/lib/storage";

export const GET = route<{ fileId: string }>(async (_req, { fileId }) => {
  const f = db.getSubmissionFile(fileId);
  if (!f) throw new ServiceError("קובץ לא נמצא", 404);
  return fileResponse(readStored(f), f.mime, f.filename);
});

export const DELETE = route<{ fileId: string }>(async (_req, { fileId }) => {
  const f = db.getSubmissionFile(fileId);
  if (!f) throw new ServiceError("קובץ לא נמצא", 404);
  const sub = mustGetSubmission(f.submissionId);
  if (sub.status === "approved" || sub.status === "processing") throw new ServiceError("לא ניתן לשנות קבצים כעת.", 409);
  if (sub.files.length <= 1) throw new ServiceError("זהו הקובץ היחיד של העבודה. השתמשו ב'החלפת קובץ' במקום.");
  db.deleteSubmissionFile(fileId);
  removeStored(f);
  return { ok: true };
});
