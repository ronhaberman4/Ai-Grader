import { route, readJson } from "@/lib/api";
import * as db from "@/lib/db";
import { mustGetSession, mustGetSubmission, ServiceError, updateSubmissionMeta } from "@/lib/service";
import { removeScope } from "@/lib/storage";
import type { OverallFeedback } from "@/lib/types";

export const dynamic = "force-dynamic";

export const GET = route<{ sid: string }>(async (_req, { sid }) => {
  const submission = mustGetSubmission(sid);
  const session = mustGetSession(submission.sessionId);
  const siblings = db.listSubmissions(session.id).map((s) => ({ id: s.id, studentName: s.studentName, status: s.status }));
  return { submission, session, siblings };
});

export const PATCH = route<{ sid: string }>(async (req, { sid }) => {
  const body = await readJson(req);
  return {
    submission: updateSubmissionMeta(sid, {
      studentName: typeof body.studentName === "string" ? body.studentName : undefined,
      teacherComment: typeof body.teacherComment === "string" ? body.teacherComment : undefined,
      teacherOverall: body.teacherOverall === undefined ? undefined : (body.teacherOverall as OverallFeedback | null),
    }),
  };
});

export const DELETE = route<{ sid: string }>(async (_req, { sid }) => {
  const sub = mustGetSubmission(sid);
  if (sub.status === "processing") throw new ServiceError("העבודה בבדיקה כרגע. נסו שוב בעוד רגע.", 409);
  db.deleteSubmission(sid);
  removeScope(sid);
  return { ok: true };
});
