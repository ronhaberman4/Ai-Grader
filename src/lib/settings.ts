// Teacher-editable settings stored in data/settings.json, so no config file has to be edited by hand.
// Environment variables (.env.local) still take priority when set.
import { randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { dataDir } from "./paths";

export type StoredSettings = {
  anthropicApiKey?: string;
  appPassword?: string;
  sessionSecret?: string;
  model?: string;
};

export const MODEL_CHOICES = [
  { id: "claude-sonnet-5-5", label: "Claude Sonnet 5.5", hint: "מומלץ — חזק מאוד ובמחיר בינוני" },
  { id: "claude-opus-5-5", label: "Claude Opus 5.5", hint: "החזק ביותר — בערך פי 2 במחיר" },
] as const;

function file() {
  return path.join(dataDir(), "settings.json");
}

export function readSettings(): StoredSettings {
  try {
    return JSON.parse(fs.readFileSync(file(), "utf8")) as StoredSettings;
  } catch {
    return {};
  }
}

export function writeSettings(patch: Partial<StoredSettings>) {
  const next = { ...readSettings(), ...patch };
  for (const k of Object.keys(next) as (keyof StoredSettings)[]) if (next[k] === "") delete next[k];
  fs.mkdirSync(dataDir(), { recursive: true });
  fs.writeFileSync(file(), JSON.stringify(next, null, 2), { mode: 0o600 });
}

export function apiKey(): string | undefined {
  return process.env.ANTHROPIC_API_KEY || readSettings().anthropicApiKey || undefined;
}

export function appPassword(): string | undefined {
  return process.env.APP_PASSWORD || readSettings().appPassword || undefined;
}

export function configuredModel(): string | undefined {
  return process.env.GRADER_MODEL || readSettings().model || undefined;
}

/** Secret for signing the login cookie; generated once and kept in settings.json if not set in the environment. */
export function sessionSecret(): string {
  if (process.env.SESSION_SECRET) return process.env.SESSION_SECRET;
  const s = readSettings();
  if (s.sessionSecret) return s.sessionSecret;
  const secret = randomBytes(32).toString("hex");
  writeSettings({ sessionSecret: secret });
  return secret;
}
