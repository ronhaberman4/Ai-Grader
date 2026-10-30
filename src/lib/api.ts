import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { AiError } from "./ai";
import { AUTH_COOKIE, verifyToken } from "./auth";
import { ExtractionError } from "./extract";
import { ServiceError } from "./service";
import { UploadError } from "./storage";

type Ctx<P> = { params: Promise<P> };

/**
 * Wraps a route handler with authentication and uniform error handling.
 * Every API route goes through this, so no student data is served without the teacher's login.
 */
export function route<P = Record<string, string>>(
  handler: (req: Request, params: P) => Promise<Response | unknown>,
) {
  return async (req: Request, ctx: Ctx<P>) => {
    const token = (await cookies()).get(AUTH_COOKIE)?.value;
    if (!(await verifyToken(token))) {
      return NextResponse.json({ error: "נדרשת התחברות" }, { status: 401 });
    }
    try {
      const result = await handler(req, await ctx.params);
      if (result instanceof Response) return result;
      return NextResponse.json(result ?? { ok: true });
    } catch (e) {
      return errorResponse(e);
    }
  };
}

export function errorResponse(e: unknown) {
  if (e instanceof ServiceError) return NextResponse.json({ error: e.message }, { status: e.status });
  if (e instanceof UploadError || e instanceof ExtractionError) return NextResponse.json({ error: e.message }, { status: 400 });
  if (e instanceof AiError) return NextResponse.json({ error: e.message }, { status: 502 });
  if (e instanceof ZodError) {
    return NextResponse.json({ error: "נתונים לא תקינים: " + e.issues.map((i) => i.message).join(", ") }, { status: 400 });
  }
  console.error(e);
  return NextResponse.json({ error: "שגיאת שרת: " + (e instanceof Error ? e.message : String(e)) }, { status: 500 });
}

export async function readJson(req: Request): Promise<Record<string, unknown>> {
  try {
    return (await req.json()) as Record<string, unknown>;
  } catch {
    throw new ServiceError("בקשה לא תקינה");
  }
}

export function fileResponse(buf: Buffer, mime: string, filename: string) {
  return new Response(new Uint8Array(buf), {
    headers: {
      "Content-Type": mime === "text/plain" ? "text/plain; charset=utf-8" : mime,
      "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(filename)}`,
      "Cache-Control": "private, max-age=3600",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
