import { route, readJson } from "@/lib/api";
import { extractRubric } from "@/lib/service";

export const maxDuration = 600;

export const POST = route<{ id: string }>(async (req, { id }) => {
  const body = await readJson(req);
  return { session: await extractRubric(id, typeof body.pastedText === "string" ? body.pastedText : "") };
});
