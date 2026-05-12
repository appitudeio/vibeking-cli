import type { DailyAggregate } from "./types.js";

/**
 * Pick the model with the most token weight across the supplied days.
 * Operates on the per-shard tokens that the v5 scanner produces — no
 * `modelBreakdown` indirection because shards carry precise tokens per
 * (tool, model). When a user runs multiple tools in a day, this picks
 * the top model regardless of which tool ran it.
 */
export function pickTopModel(daily: DailyAggregate[]): {
  model: string | null;
  share: number;
} {
  const totals = new Map<string, number>();
  let grand = 0;
  for (const d of daily) {
    for (const s of d.shards) {
      const weight = s.inputTokens + s.outputTokens + s.cacheWriteTokens;
      totals.set(s.model, (totals.get(s.model) ?? 0) + weight);
      grand += weight;
    }
  }
  if (grand === 0 || totals.size === 0) {
    return { model: null, share: 0 };
  }

  let bestModel = "";
  let best = -1;
  for (const [m, n] of totals.entries()) {
    if (n > best) {
      best = n;
      bestModel = m;
    }
  }
  return { model: bestModel, share: best / grand };
}
