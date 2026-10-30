import { route, readJson } from "@/lib/api";
import { hasTeacherChanges } from "@/lib/scoring";
import { mustGetSubmission, requestGrading, ServiceError } from "@/lib/service";

/** Start / retry / re-run grading. Teacher changes are kept unless overwriteTeacherChanges is explicitly confirmed. */
export const POST = route<{ sid: string }>(async (req, { sid }) => {
  const body = await readJson(req).catch(() => ({}) as Record<string, unknown>);
  const overwrite = body.overwriteTeacherChanges === true;
  const sub = mustGetSubmission(sid);
  if (sub.status === "processing") throw new ServiceError("העבודה כבר בבדיקה.", 409);
  if (overwrite && body.confirm !== "overwrite" && hasTeacherChanges(sub.results)) {
    throw new ServiceError("נדרש אישור מפורש לדריסת השינויים שלך.");
  }
  requestGrading(sid, { overwriteTeacherChanges: overwrite });
  return { submission: mustGetSubmission(sid) };
});
