import { route } from "@/lib/api";
import * as db from "@/lib/db";
import { mustGetSubmission, ServiceError } from "@/lib/service";
import { removeStored, saveUpload } from "@/lib/storage";

/** Add pages (mode=append) or replace all files (mode=replace) of a submission. Does not start grading. */
export const POST = route<{ sid: string }>(async (req, { sid }) => {
  const sub = mustGetSubmission(sid);
  if (sub.status === "approved" || sub.status === "processing") {
    throw new ServiceError("לא ניתן לשנות קבצים לעבודה מאושרת או בבדיקה.", 409);
  }
  const form = await req.formData();
  const files = form.getAll("files").filter((f): f is File => f instanceof File);
  if (files.length === 0) throw new ServiceError("לא נבחרו קבצים");
  const stored = [];
  for (const f of files) stored.push(saveUpload(sid, f.name, Buffer.from(await f.arrayBuffer())));
  if (form.get("mode") === "replace") {
    for (const old of sub.files) {
      db.deleteSubmissionFile(old.id);
      removeStored(old);
    }
  }
  for (const s of stored) db.addSubmissionFile(sid, s);
  return { submission: mustGetSubmission(sid) };
});
