import type { DailyAggregate } from "../core/index.js";

export function pickTopModel(daily: DailyAggregate[]): {
  model: string | null;
  share: number;
} {
  const totals = new Map<string, number>();
  let grand = 0;
  for (const d of daily) {
    for (const [model, share] of Object.entries(d.modelBreakdown)) {
      const weight = share * (d.inputTokens + d.outputTokens + d.cacheWriteTokens);
      totals.set(model, (totals.get(model) ?? 0) + weight);
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
