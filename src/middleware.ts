import { NextResponse, type NextRequest } from "next/server";
import { AUTH_COOKIE, verifyToken } from "@/lib/auth";

// Protects pages. API routes check authentication themselves (see lib/api.ts).
export async function middleware(req: NextRequest) {
  if (await verifyToken(req.cookies.get(AUTH_COOKIE)?.value)) return NextResponse.next();
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = `?next=${encodeURIComponent(req.nextUrl.pathname)}`;
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!api|login|_next|favicon.ico).*)"],
};
