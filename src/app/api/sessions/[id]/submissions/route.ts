import { route } from "@/lib/api";
import * as db from "@/lib/db";
import { nameFromFilename } from "@/lib/names";
import { gradingQueue, mustGetSession, requestGrading, resumePending, ServiceError } from "@/lib/service";
import { saveUpload } from "@/lib/storage";

export const dynamic = "force-dynamic";

export const GET = route<{ id: string }>(async (_req, { id }) => {
  const session = mustGetSession(id);
  resumePending(id);
  return { session, submissions: db.listSubmissions(id), queue: gradingQueue().stats(), cost: db.sessionCost(id) };
});

/**
 * Upload student work. By default every file is a separate student.
 * With combine=1 all files are pages of one student's submission.
 */
export const POST = route<{ id: string }>(async (req, { id }) => {
  const s = mustGetSession(id);
  if (!s.rubricLockedAt) throw new ServiceError("יש לנעול את המחוון לפני העלאת עבודות.");
  const form = await req.formData();
  const files = form.getAll("files").filter((f): f is File => f instanceof File);
  if (files.length === 0) throw new ServiceError("לא נבחרו קבצים");
  const combine = form.get("combine") === "1";
  const manualName = String(form.get("studentName") ?? "").trim();

  const groups: File[][] = combine ? [files] : files.map((f) => [f]);
  const created = [];
  for (const group of groups) {
    const guessed = manualName || nameFromFilename(group[0].name) || "";
    const sub = db.createSubmission(id, guessed, manualName ? "manual" : guessed ? "filename" : "none");
    try {
      for (const f of group) db.addSubmissionFile(sub.id, saveUpload(sub.id, f.name, Buffer.from(await f.arrayBuffer())));
    } catch (e) {
      db.deleteSubmission(sub.id);
      throw e;
    }
    requestGrading(sub.id);
    created.push(db.getSubmission(sub.id));
  }
  return { submissions: created };
});
