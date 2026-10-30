import { describe, expect, it } from "vitest";
import { costUsd, formatUsd, usageByModel } from "@/lib/pricing";

describe("cost estimation", () => {
  it("prices Sonnet 5.5 tokens including cache reads and writes", () => {
    const c = costUsd({ model: "claude-sonnet-5-5", inputTokens: 1_000_000, outputTokens: 100_000, cacheReadTokens: 1_000_000, cacheWriteTokens: 0 });
    expect(c).toBeCloseTo(2 + 1 + 0.2, 6);
    expect(costUsd({ model: "claude-sonnet-5-5", inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 1_000_000 })).toBeCloseTo(2.5, 6);
  });

  it("returns null for unknown models instead of guessing", () => {
    expect(costUsd({ model: "some-other-model", inputTokens: 1, outputTokens: 1, cacheReadTokens: 0, cacheWriteTokens: 0 })).toBeNull();
  });

  it("splits usage per model when a refusal fallback ran", () => {
    const parts = usageByModel("claude-opus-5-5", {
      input_tokens: 300,
      output_tokens: 30,
      iterations: [
        { model: "claude-sonnet-5-5", input_tokens: 100, output_tokens: 10, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
        { model: "claude-opus-5-5", input_tokens: 200, output_tokens: 20, cache_read_input_tokens: 5, cache_creation_input_tokens: 0 },
      ],
    });
    expect(parts.map((p) => p.model)).toEqual(["claude-sonnet-5-5", "claude-opus-5-5"]);
    expect(parts[1].cacheReadTokens).toBe(5);
  });

  it("uses top-level usage when there are no iterations", () => {
    const [u] = usageByModel("claude-sonnet-5-5", { input_tokens: 5, output_tokens: 6, cache_read_input_tokens: null, iterations: null });
    expect(u).toEqual({ model: "claude-sonnet-5-5", inputTokens: 5, outputTokens: 6, cacheReadTokens: 0, cacheWriteTokens: 0 });
  });

  it("formats small amounts readably", () => {
    expect(formatUsd(0.004)).toBe("<$0.01");
    expect(formatUsd(0.237)).toBe("$0.24");
    expect(formatUsd(null)).toBe("—");
  });
});
