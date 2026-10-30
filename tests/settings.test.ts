import fs from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { authEnabled, checkPassword, createToken, verifyToken } from "@/lib/auth";
import { apiKey, appPassword, configuredModel, readSettings, sessionSecret, writeSettings } from "@/lib/settings";
import { useTempData } from "./helpers";

describe("settings screen storage", () => {
  let dir: string;
  const saved = { ...process.env };
  beforeEach(() => {
    dir = useTempData();
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.APP_PASSWORD;
    delete process.env.SESSION_SECRET;
    delete process.env.GRADER_MODEL;
  });
  afterEach(() => {
    process.env = { ...saved };
  });

  it("stores the key, password and model in data/settings.json", () => {
    expect(apiKey()).toBeUndefined();
    writeSettings({ anthropicApiKey: "sk-ant-abc", appPassword: "pass1", model: "claude-opus-5-5" });
    expect(apiKey()).toBe("sk-ant-abc");
    expect(appPassword()).toBe("pass1");
    expect(configuredModel()).toBe("claude-opus-5-5");
    expect(fs.existsSync(path.join(dir, "settings.json"))).toBe(true);
    writeSettings({ appPassword: "" });
    expect(appPassword()).toBeUndefined();
    expect(readSettings().anthropicApiKey).toBe("sk-ant-abc");
  });

  it("environment variables take priority over the settings file", () => {
    writeSettings({ anthropicApiKey: "sk-ant-file" });
    process.env.ANTHROPIC_API_KEY = "sk-ant-env";
    expect(apiKey()).toBe("sk-ant-env");
  });

  it("generates and keeps a session secret", () => {
    const s = sessionSecret();
    expect(s).toHaveLength(64);
    expect(sessionSecret()).toBe(s);
  });

  it("login works with a password set on the settings screen, and changing it logs old cookies out", async () => {
    expect(authEnabled()).toBe(false);
    expect(await verifyToken(undefined)).toBe(true);
    writeSettings({ appPassword: "secret1" });
    expect(authEnabled()).toBe(true);
    expect(checkPassword("secret1")).toBe(true);
    expect(checkPassword("nope")).toBe(false);
    const t = await createToken();
    expect(await verifyToken(t.value)).toBe(true);
    expect(await verifyToken(undefined)).toBe(false);
    writeSettings({ appPassword: "secret2" });
    expect(await verifyToken(t.value)).toBe(false);
  });
});
