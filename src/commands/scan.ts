import type { ScanSummary } from "../core/index.js";
import pc from "picocolors";
import { scanClaudeCode } from "../scanner.js";
import { renderReveal, renderEmptyState } from "../reveal.js";
import { pickTopModel } from "../util/topModel.js";

export type ScanOptions = {
  scope?: "weekly" | "monthly" | "all_time";
};

export async function runScan(opts: ScanOptions = {}): Promise<{
  summary: ScanSummary;
}> {
  const scope = opts.scope ?? "weekly";
  const summary = await scanClaudeCode();

  if (summary.daily.length === 0) {
    process.stdout.write(
      renderEmptyState("No Claude Code sessions found in ~/.claude/projects.")
    );
    return { summary };
  }

  const cutoff = scopeCutoff(scope);
  const inRange = summary.daily.filter((d) => d.date >= cutoff);
  const totals = inRange.reduce(
    (acc, d) => {
      acc.tokens +=
        d.inputTokens +
        d.outputTokens +
        d.cacheWriteTokens +
        Math.floor(d.cacheReadTokens * 0.1);
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

  return { summary };
}

function scopeCutoff(scope: NonNullable<ScanOptions["scope"]>): string {
  if (scope === "all_time") return "0000-00-00";
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const daysBack = scope === "weekly" ? 6 : 29;
  today.setUTCDate(today.getUTCDate() - daysBack);
  return today.toISOString().slice(0, 10);
}
