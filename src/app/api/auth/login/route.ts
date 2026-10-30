import { NextResponse } from "next/server";
import { AUTH_COOKIE, authEnabled, checkPassword, createToken } from "@/lib/auth";

export async function POST(req: Request) {
  if (!authEnabled()) return NextResponse.json({ ok: true });
  const { password } = (await req.json().catch(() => ({}))) as { password?: string };
  if (!password || !checkPassword(password)) {
    await new Promise((r) => setTimeout(r, 600));
    return NextResponse.json({ error: "סיסמה שגויה" }, { status: 401 });
  }
  const token = await createToken();
  const res = NextResponse.json({ ok: true });
  res.cookies.set(AUTH_COOKIE, token.value, {
    httpOnly: true,
    sameSite: "lax",
    secure: new URL(req.url).protocol === "https:",
    path: "/",
    maxAge: token.maxAge,
  });
  return res;
}
