import { route, readJson } from "@/lib/api";
import { saveRubricEdits } from "@/lib/service";

export const PUT = route<{ id: string }>(async (req, { id }) => {
  const body = await readJson(req);
  return {
    session: saveRubricEdits(id, body.rubric, {
      dismissAiIssues: body.dismissAiIssues === true,
      pastedText: typeof body.pastedText === "string" ? body.pastedText : undefined,
    }),
  };
});
