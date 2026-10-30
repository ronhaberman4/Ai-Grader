// Simple single-teacher password protection (used by the Node.js middleware and API routes).
import { appPassword, sessionSecret } from "./settings";

export const AUTH_COOKIE = "grader_auth";
const MAX_AGE_SECONDS = 60 * 60 * 24 * 14;

export function authEnabled(): boolean {
  return !!appPassword();
}

function secret(): string {
  return sessionSecret() + "|" + (appPassword() || "");
}

async function hmac(data: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data));
  return Array.from(new Uint8Array(sig), (b) => b.toString(16).padStart(2, "0")).join("");
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function createToken(): Promise<{ value: string; maxAge: number }> {
  const expires = Math.floor(Date.now() / 1000) + MAX_AGE_SECONDS;
  return { value: `${expires}.${await hmac(String(expires))}`, maxAge: MAX_AGE_SECONDS };
}

export async function verifyToken(token: string | undefined): Promise<boolean> {
  if (!authEnabled()) return true;
  if (!token) return false;
  const [exp, sig] = token.split(".");
  if (!exp || !sig || Number(exp) < Date.now() / 1000) return false;
  return safeEqual(sig, await hmac(exp));
}

export function checkPassword(input: string): boolean {
  const expected = appPassword() || "";
  return safeEqual(input, expected);
}
