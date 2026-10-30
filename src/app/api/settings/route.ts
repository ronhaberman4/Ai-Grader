import { NextResponse } from "next/server";
import { modelName, testApiKey } from "@/lib/ai";
import { readJson, route } from "@/lib/api";
import { AUTH_COOKIE, createToken } from "@/lib/auth";
import { ServiceError } from "@/lib/service";
import { apiKey, appPassword, MODEL_CHOICES, writeSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";

function view() {
  const key = apiKey();
  return {
    apiKey: key ? { hint: "…" + key.slice(-4), fromEnv: !!process.env.ANTHROPIC_API_KEY } : null,
    password: appPassword() ? { fromEnv: !!process.env.APP_PASSWORD } : null,
    model: modelName(),
    modelFromEnv: !!process.env.GRADER_MODEL,
    modelChoices: MODEL_CHOICES,
  };
}

export const GET = route(async () => view());

/** Save the API key (tested first), the login password and/or the model. Values are never sent back to the browser. */
export const PUT = route(async (req) => {
  const body = await readJson(req);
  const patch: Parameters<typeof writeSettings>[0] = {};

  if (typeof body.model === "string") {
    if (!MODEL_CHOICES.some((m) => m.id === body.model)) throw new ServiceError("מודל לא מוכר");
    patch.model = body.model;
  }
  if (typeof body.anthropicApiKey === "string") {
    const key = body.anthropicApiKey.trim();
    if (!key.startsWith("sk-ant-")) throw new ServiceError("מפתח של Claude מתחיל ב-sk-ant-. ודאו שהעתקתם אותו במלואו.");
    const test = await testApiKey(key, (patch.model as string) || modelName());
    if (!test.ok) throw new ServiceError(test.error);
    patch.anthropicApiKey = key;
  }
  let passwordChanged = false;
  if (body.appPassword !== undefined) {
    if (process.env.APP_PASSWORD) throw new ServiceError("הסיסמה מוגדרת בקובץ .env.local ולא ניתן לשנות אותה כאן.");
    const pw = body.appPassword === null ? "" : String(body.appPassword);
    if (pw && pw.length < 4) throw new ServiceError("הסיסמה צריכה להכיל לפחות 4 תווים.");
    patch.appPassword = pw;
    passwordChanged = true;
  }
  if (Object.keys(patch).length === 0) throw new ServiceError("לא נשלח שום שינוי");
  writeSettings(patch);

  const res = NextResponse.json(view());
  // The cookie signature depends on the password, so keep the teacher logged in after changing it.
  if (passwordChanged && appPassword()) {
    const token = await createToken();
    res.cookies.set(AUTH_COOKIE, token.value, {
      httpOnly: true,
      sameSite: "lax",
      secure: new URL(req.url).protocol === "https:",
      path: "/",
      maxAge: token.maxAge,
    });
  }
  return res;
});
