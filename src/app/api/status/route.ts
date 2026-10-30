import { isAiConfigured } from "@/lib/ai";
import { route } from "@/lib/api";

export const dynamic = "force-dynamic";

export const GET = route(async () => ({
  aiConfigured: isAiConfigured(),
  model: process.env.OPENAI_MODEL || "gpt-5.5",
}));
