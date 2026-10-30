import { isAiConfigured, modelName } from "@/lib/ai";
import { route } from "@/lib/api";

export const dynamic = "force-dynamic";

export const GET = route(async () => ({
  aiConfigured: isAiConfigured(),
  model: modelName(),
}));
