import { route, readJson } from "@/lib/api";
import type { ReviewAction } from "@/lib/scoring";
import { acceptAllConfident, reviewQuestion, ServiceError } from "@/lib/service";

const TYPES = ["set_points", "set_criterion", "accept", "reject", "mark_manual", "reset", "set_feedback"];

export const POST = route<{ sid: string }>(async (req, { sid }) => {
  const body = await readJson(req);
  if (body.acceptAllConfident === true) return { submission: acceptAllConfident(sid) };
  const action = body.action as ReviewAction | undefined;
  if (typeof body.questionId !== "string" || !action || !TYPES.includes(action.type)) {
    throw new ServiceError("פעולה לא תקינה");
  }
  if ((action.type === "set_points" || action.type === "set_criterion") && action.points !== null && !Number.isFinite(action.points)) {
    throw new ServiceError("ניקוד לא תקין");
  }
  return { submission: reviewQuestion(sid, body.questionId, action) };
});
