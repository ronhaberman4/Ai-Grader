import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
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

export function isAiConfigured(): boolean {
  return !!process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY !== "sk-...";
}

class OpenAiModelClient implements ModelClient {
  model: string;
  private client: OpenAI;
  constructor() {
    this.model = process.env.OPENAI_MODEL || "gpt-5.5";
    this.client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY, timeout: 5 * 60_000, maxRetries: 2 });
  }

  async structured<T extends z.ZodTypeAny>(req: StructuredRequest<T>): Promise<z.infer<T>> {
    const effort = process.env.OPENAI_REASONING_EFFORT?.trim();
    let response;
    try {
      response = await this.client.responses.create({
        model: this.model,
        instructions: req.instructions,
        input: [{ role: "user", content: req.input }],
        text: { format: zodTextFormat(req.schema, req.name) },
        ...(effort ? { reasoning: { effort: effort as "low" | "medium" | "high" } } : {}),
        store: false,
      });
    } catch (e) {
      throw new AiError(describeOpenAiError(e));
    }
    if (response.status === "incomplete") {
      throw new AiError("תשובת ה-AI נקטעה (התוכן ארוך מדי). נסו לפצל את הקבצים או לנסות שוב.");
    }
    const refusal = response.output
      .flatMap((o) => (o.type === "message" ? o.content : []))
      .find((c) => c.type === "refusal");
    if (refusal && refusal.type === "refusal") throw new AiError(`ה-AI סירב לבצע את הבקשה: ${refusal.refusal}`);

    let data: unknown;
    try {
      data = JSON.parse(response.output_text);
    } catch {
      throw new AiError("ה-AI החזיר תשובה שאינה JSON תקין.");
    }
    // Validate again on our side — never trust the shape blindly.
    const parsed = req.schema.safeParse(data);
    if (!parsed.success) throw new AiError("תשובת ה-AI לא תאמה למבנה הנדרש: " + parsed.error.message.slice(0, 300));
    return parsed.data;
  }
}

function describeOpenAiError(e: unknown): string {
  if (e instanceof OpenAI.APIError) {
    if (e.status === 401) return "מפתח ה-OpenAI אינו תקין. בדקו את OPENAI_API_KEY בקובץ .env.local.";
    if (e.status === 429) return "חרגתם ממגבלת השימוש או מהיתרה ב-OpenAI. בדקו את החשבון ונסו שוב.";
    if (e.status === 404) return `המודל "${process.env.OPENAI_MODEL || "gpt-5.5"}" לא זמין בחשבון שלכם. שנו את OPENAI_MODEL.`;
    if (e.status === 400) return "OpenAI דחה את הבקשה: " + e.message;
    return `שגיאת OpenAI (${e.status ?? "רשת"}): ${e.message}`;
  }
  return "שגיאה בתקשורת עם OpenAI: " + (e instanceof Error ? e.message : String(e));
}

let override: ModelClient | null = null;

/** Tests inject a fake client here. */
export function setModelClientForTests(client: ModelClient | null) {
  override = client;
}

export function getModelClient(): ModelClient {
  if (override) return override;
  if (!isAiConfigured()) {
    throw new AiError("לא הוגדר מפתח OpenAI. יש להוסיף OPENAI_API_KEY לקובץ .env.local ולהפעיל מחדש את השרת.");
  }
  return new OpenAiModelClient();
}
