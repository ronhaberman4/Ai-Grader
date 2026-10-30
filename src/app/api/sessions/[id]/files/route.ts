import { route } from "@/lib/api";
import * as db from "@/lib/db";
import { mustGetSession, ServiceError } from "@/lib/service";
import { saveUpload } from "@/lib/storage";
import type { SessionFileKind } from "@/lib/types";

const KINDS: SessionFileKind[] = ["exam", "answer_key", "rubric"];

export const POST = route<{ id: string }>(async (req, { id }) => {
  const s = mustGetSession(id);
  if (s.rubricLockedAt) throw new ServiceError("המחוון נעול — לא ניתן להוסיף קבצי מחוון.", 409);
  const form = await req.formData();
  const kind = form.get("kind") as SessionFileKind;
  if (!KINDS.includes(kind)) throw new ServiceError("סוג קובץ לא תקין");
  const files = form.getAll("files").filter((f): f is File => f instanceof File);
  if (files.length === 0) throw new ServiceError("לא נבחרו קבצים");
  const saved = [];
  for (const f of files) {
    const stored = saveUpload(id, f.name, Buffer.from(await f.arrayBuffer()));
    saved.push(db.addSessionFile(id, kind, stored));
  }
  return { files: saved };
});
