import type { DailyAggregate } from "./types.js";

/**
 * Anthropic API list prices, $ per 1M tokens, as of 2026-05.
 * These are the "API-equivalent" rates — what an API customer would
 * pay. Claude Pro/Max subscribers don't actually get billed per token,
 * but this is what their burn would have cost on the API. That's
 * exactly the meme: "I burned $42K of Claude on my $200/mo subscription."
 */
type ModelPrice = {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number; // 5m TTL — the common case
};

const PRICING: Record<string, ModelPrice> = {
  // Opus tier
  "claude-opus-4-7": { input: 15, output: 75, cacheRead: 1.5, cacheWrite: 18.75 },
  "claude-opus-4-6": { input: 15, output: 75, cacheRead: 1.5, cacheWrite: 18.75 },
  "claude-opus-4-5": { input: 15, output: 75, cacheRead: 1.5, cacheWrite: 18.75 },
  // Sonnet tier
  "claude-sonnet-4-6": { input: 3, output: 15, cacheRead: 0.3, cacheWrite: 3.75 },
  "claude-sonnet-4-5": { input: 3, output: 15, cacheRead: 0.3, cacheWrite: 3.75 },
  // Haiku tier
  "claude-haiku-4-5": { input: 1, output: 5, cacheRead: 0.1, cacheWrite: 1.25 },
};

// Sonnet tier as a safe middle for unknown models.
const FALLBACK: ModelPrice = {
  input: 3,
  output: 15,
  cacheRead: 0.3,
  cacheWrite: 3.75,
};

function priceFor(model: string): ModelPrice {
  const direct = PRICING[model];
  if (direct) return direct;
  const lower = model.toLowerCase();
  if (lower.includes("opus")) return PRICING["claude-opus-4-7"]!;
  if (lower.includes("haiku")) return PRICING["claude-haiku-4-5"]!;
  if (lower.includes("sonnet")) return PRICING["claude-sonnet-4-6"]!;
  return FALLBACK;
}

/**
 * Estimate API-equivalent USD across the daily aggregates. Uses each
 * day's modelBreakdown shares as the model-mix proxy — share is fraction
 * of assistant records, which approximates fraction of token traffic.
 * Good enough for a leaderboard headline; not for billing.
 */
export function estimateCostUsd(daily: DailyAggregate[]): number {
  let total = 0;
  for (const d of daily) {
    const sumShare =
      Object.values(d.modelBreakdown).reduce((a, b) => a + b, 0) || 1;
    let dayCost = 0;
    for (const [model, share] of Object.entries(d.modelBreakdown)) {
      const p = priceFor(model);
      const fraction = share / sumShare;
      dayCost +=
        fraction *
        ((d.inputTokens / 1_000_000) * p.input +
          (d.outputTokens / 1_000_000) * p.output +
          (d.cacheReadTokens / 1_000_000) * p.cacheRead +
          (d.cacheWriteTokens / 1_000_000) * p.cacheWrite);
    }
    total += dayCost;
  }
  return total;
}

/** Compact dollar formatter for share cards / leaderboard rows. */
export function formatUsd(amount: number): string {
  if (!Number.isFinite(amount) || amount < 0) return "$0";
  if (amount >= 1_000_000)
    return `$${(amount / 1_000_000).toFixed(2)}M`;
  if (amount >= 10_000) return `$${Math.round(amount / 1000)}K`;
  if (amount >= 1_000) return `$${(amount / 1000).toFixed(1)}K`;
  if (amount >= 100) return `$${Math.round(amount)}`;
  if (amount >= 1) return `$${amount.toFixed(2)}`;
  return `$${amount.toFixed(3)}`;
}
