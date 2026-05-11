import pc from "picocolors";
import type { Scope } from "../core/types.js";
import { scanClaudeCode } from "../scanner.js";
import { renderReveal, renderEmptyState } from "../reveal.js";
import { pickTopModel } from "../util/topModel.js";

export type ScanOptions = {
  scope?: Scope;
};

// Cache reads are billed at ~10% of write tokens on the Anthropic API, so a
// straight sum would over-credit cache-heavy days. The 0.1 weight keeps the
// "tokens burned" headline aligned with API-equivalent cost.
const CACHE_READ_WEIGHT = 0.1;

export async function runScan(opts: ScanOptions = {}): Promise<void> {
  const scope = opts.scope ?? "weekly";
  const summary = await scanClaudeCode();

  if (summary.daily.length === 0) {
    process.stdout.write(
      renderEmptyState("No Claude Code sessions found in ~/.claude/projects.")
    );
    return;
  }

  const cutoff = scopeCutoff(scope);
  const inRange = cutoff
    ? summary.daily.filter((d) => d.date >= cutoff)
    : summary.daily;
  const totals = inRange.reduce(
    (acc, d) => {
      acc.tokens +=
        d.inputTokens +
        d.outputTokens +
        d.cacheWriteTokens +
        Math.floor(d.cacheReadTokens * CACHE_READ_WEIGHT);
      acc.sessions += d.sessions;
      return acc;
    },
    { tokens: 0, sessions: 0 }
  );
  const top = pickTopModel(inRange);

  process.stdout.write(
    renderReveal({
      scope,
      tokens: totals.tokens,
      sessions: totals.sessions,
      activeDays: inRange.length,
      topModel: top.model,
      topModelShare: top.share,
    })
  );

  process.stdout.write(
    `  ${pc.dim("inspect upload")}  ${pc.bold("vibeking inspect-upload")}  ${pc.dim("(see exactly what would be sent)")}\n\n`
  );
}

function scopeCutoff(scope: Scope): string | null {
  if (scope === "all_time") return null;
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const daysBack = scope === "weekly" ? 6 : 29;
  today.setUTCDate(today.getUTCDate() - daysBack);
  return today.toISOString().slice(0, 10);
}
