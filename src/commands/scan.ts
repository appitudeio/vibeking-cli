import {
  buildScore,
  summarizeRange,
  SCORING_VERSION,
  type Score,
  type ScanSummary,
} from "../core/index.js";
import pc from "picocolors";
import { scanClaudeCode } from "../scanner.js";
import { renderReveal, renderEmptyState } from "../reveal.js";
import { pickTopModel } from "../util/topModel.js";

export type ScanOptions = {
  scope?: "weekly" | "monthly" | "all_time";
};

export async function runScan(opts: ScanOptions = {}): Promise<{
  summary: ScanSummary;
  score: Score;
}> {
  const scope = opts.scope ?? "weekly";

  const summary = await scanClaudeCode();

  if (summary.daily.length === 0) {
    process.stdout.write(
      renderEmptyState(
        "No Claude Code sessions found in ~/.claude/projects."
      )
    );
    return { summary, score: emptyScore(scope) };
  }

  const score = buildScore(summary.daily, scope);
  const ranged = summarizeRange(summary.daily, scope);
  const top = pickTopModel(summary.daily);

  process.stdout.write(
    renderReveal({
      score,
      totalSessions: ranged.totalSessions,
      activeDays: ranged.activeDays,
      topModel: top.model,
      topModelShare: top.share,
      daysCovered: summary.totalDays,
    })
  );

  process.stdout.write(
    `  ${pc.dim("inspect upload")}  ${pc.bold("vibeking inspect-upload")}  ${pc.dim("(see exactly what would be sent)")}\n\n`
  );

  return { summary, score };
}

function emptyScore(scope: "weekly" | "monthly" | "all_time"): Score {
  return {
    scope,
    vibeBurn: 0,
    vibeScore: 0,
    level: 1,
    noLifeIndex: 0,
    title: "Vibe Tourist",
    flair: "no scans yet",
    badges: [],
    scoringVersion: SCORING_VERSION,
  };
}
