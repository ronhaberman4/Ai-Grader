// Estimated cost of Claude API calls, from Anthropic's published per-token prices.
// The exact amount billed is shown in console.anthropic.com → Usage.

type Price = { input: number; output: number; cacheRead: number; cacheWrite: number }; // USD per 1M tokens

const PRICES: Record<string, Price> = {
  "claude-sonnet-5-5": { input: 2, output: 10, cacheRead: 0.2, cacheWrite: 2.5 },
  "claude-sonnet-5": { input: 2, output: 10, cacheRead: 0.2, cacheWrite: 2.5 },
  "claude-opus-5-5": { input: 4, output: 20, cacheRead: 0.2, cacheWrite: 5 },
  "claude-opus-5": { input: 5, output: 25, cacheRead: 0.5, cacheWrite: 6.25 },
  "claude-opus-4-8": { input: 5, output: 25, cacheRead: 0.5, cacheWrite: 6.25 },
  "claude-haiku-5-5": { input: 0.1, output: 0.5, cacheRead: 0.01, cacheWrite: 0.125 },
  "claude-fable-5-1": { input: 10, output: 50, cacheRead: 0.25, cacheWrite: 12.5 },
};

export type TokenUsage = {
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
};

/** Cost in USD, or null when the model's price is unknown. */
export function costUsd(u: TokenUsage): number | null {
  const p = PRICES[u.model] ?? PRICES[u.model.replace(/-\d{8}$/, "")];
  if (!p) return null;
  return (
    (u.inputTokens * p.input + u.outputTokens * p.output + u.cacheReadTokens * p.cacheRead + u.cacheWriteTokens * p.cacheWrite) /
    1_000_000
  );
}

type UsageLike = {
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
  iterations?: ({ model?: string | null; input_tokens?: number; output_tokens?: number; cache_read_input_tokens?: number; cache_creation_input_tokens?: number } | null)[] | null;
};

/**
 * Splits a response's usage by the model that produced it. When a refusal fallback ran,
 * `usage.iterations` lists each model's share, and each is priced at that model's rate.
 */
export function usageByModel(responseModel: string, usage: UsageLike): TokenUsage[] {
  const its = (usage.iterations ?? []).filter((i) => i && typeof i.input_tokens === "number");
  if (its.length > 0) {
    return its.map((i) => ({
      model: i!.model || responseModel,
      inputTokens: i!.input_tokens ?? 0,
      outputTokens: i!.output_tokens ?? 0,
      cacheReadTokens: i!.cache_read_input_tokens ?? 0,
      cacheWriteTokens: i!.cache_creation_input_tokens ?? 0,
    }));
  }
  return [
    {
      model: responseModel,
      inputTokens: usage.input_tokens,
      outputTokens: usage.output_tokens,
      cacheReadTokens: usage.cache_read_input_tokens ?? 0,
      cacheWriteTokens: usage.cache_creation_input_tokens ?? 0,
    },
  ];
}

export function formatUsd(n: number | null | undefined): string {
  if (n === null || n === undefined) return "—";
  if (n === 0) return "$0";
  if (n < 0.01) return "<$0.01";
  return "$" + (n < 10 ? n.toFixed(2) : n.toFixed(1));
}
