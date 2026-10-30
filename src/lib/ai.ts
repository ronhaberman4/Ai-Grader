import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { z } from "zod";
import type { InputPart } from "./extract";

export type StructuredRequest<T extends z.ZodTypeAny> = {
  name: string;
  instructions: string;
  input: InputPart[];
  schema: T;
};

/** Minimal interface so the grading pipeline can be tested without network calls. */
export interface ModelClient {
  model: string;
  structured<T extends z.ZodTypeAny>(req: StructuredRequest<T>): Promise<z.infer<T>>;
}

export class AiError extends Error {}

export const DEFAULT_MODEL = "claude-opus-5-5";

export function modelName(): string {
  return process.env.GRADER_MODEL || DEFAULT_MODEL;
}

export function isAiConfigured(): boolean {
  const key = process.env.ANTHROPIC_API_KEY;
  return !!key && key !== "sk-ant-...";
}

type Effort = "low" | "medium" | "high" | "xhigh" | "max";

class ClaudeModelClient implements ModelClient {
  model = modelName();
  private client = new Anthropic({ timeout: 10 * 60_000, maxRetries: 2 });

  async structured<T extends z.ZodTypeAny>(req: StructuredRequest<T>): Promise<z.infer<T>> {
    const effort = (process.env.GRADER_EFFORT?.trim() || "high") as Effort;
    let message: Anthropic.Beta.Messages.BetaMessage;
    try {
      // Streaming keeps long grading responses (many questions, bilingual feedback) clear of HTTP timeouts.
      const stream = this.client.beta.messages.stream({
        model: this.model,
        max_tokens: 64000,
        system: req.instructions,
        messages: [{ role: "user", content: req.input }],
        output_config: { effort, format: zodOutputFormat(req.schema) },
        // If a safety classifier declines, the API retries on a fallback model instead of failing.
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
      });
      message = await stream.finalMessage();
    } catch (e) {
      throw new AiError(describeError(e));
    }

    if (message.stop_reason === "refusal") {
      throw new AiError("Claude סירב לבצע את הבקשה. בדקו שהקבצים הם עבודות תלמידים ונסו שוב.");
    }
    if (message.stop_reason === "max_tokens") {
      throw new AiError("התשובה נקטעה כי היא ארוכה מדי. נסו לפצל את הקבצים או לנסות שוב.");
    }
    const text = message.content
      .filter((b): b is Anthropic.Beta.Messages.BetaTextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");

    let data: unknown;
    try {
      data = JSON.parse(text);
    } catch {
      throw new AiError("Claude החזיר תשובה שאינה JSON תקין.");
    }
    // Validate on our side too — never trust the shape blindly.
    const parsed = req.schema.safeParse(data);
    if (!parsed.success) throw new AiError("התשובה לא תאמה למבנה הנדרש: " + parsed.error.message.slice(0, 300));
    return parsed.data;
  }
}

function describeError(e: unknown): string {
  if (e instanceof Anthropic.AuthenticationError) return "מפתח ה-API של Claude אינו תקין. בדקו את ANTHROPIC_API_KEY בקובץ .env.local.";
  if (e instanceof Anthropic.PermissionDeniedError) return "למפתח אין הרשאה למודל זה. בדקו את החשבון ב-console.anthropic.com.";
  if (e instanceof Anthropic.NotFoundError) return `המודל "${modelName()}" לא נמצא. בדקו את GRADER_MODEL.`;
  if (e instanceof Anthropic.RateLimitError) return "חרגתם ממגבלת הקצב או מהיתרה בחשבון Claude. נסו שוב בעוד דקה, או בדקו את החיוב.";
  if (e instanceof Anthropic.BadRequestError) return "Claude דחה את הבקשה: " + e.message;
  if (e instanceof Anthropic.APIError) return `שגיאה מ-Claude (${e.status ?? "רשת"}): ${e.message}`;
  return "שגיאה בתקשורת עם Claude: " + (e instanceof Error ? e.message : String(e));
}

let override: ModelClient | null = null;

/** Tests inject a fake client here. */
export function setModelClientForTests(client: ModelClient | null) {
  override = client;
}

export function getModelClient(): ModelClient {
  if (override) return override;
  if (!isAiConfigured()) {
    throw new AiError("לא הוגדר מפתח API של Claude. יש להוסיף ANTHROPIC_API_KEY לקובץ .env.local ולהפעיל מחדש את האתר.");
  }
  return new ClaudeModelClient();
}
