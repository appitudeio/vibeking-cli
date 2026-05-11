import { mkdir, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import {
  buildScore,
  pickRoast,
  summarizeRange,
  SCORING_VERSION,
  type Score,
  type ScanSummary,
} from "@vibeking/core";
import kleur from "kleur";
import { scanClaudeCode } from "../scanners/claudeCode.js";
import { renderReveal, renderEmptyState } from "../reveal/terminal.js";
import { pickTopModel } from "../util/topModel.js";
import { CLI_VERSION } from "../version.js";

export type ScanOptions = {
  scope?: "weekly" | "monthly" | "all_time";
  writeCard?: boolean;
};

export async function runScan(opts: ScanOptions = {}): Promise<{
  summary: ScanSummary;
  score: Score;
  cardPath: string | null;
}> {
  const scope = opts.scope ?? "weekly";
  const writeCard = opts.writeCard ?? true;

  const summary = await scanClaudeCode();

  if (summary.daily.length === 0) {
    process.stdout.write(
      renderEmptyState(
        "No Claude Code sessions found in ~/.claude/projects."
      )
    );
    return { summary, score: emptyScore(scope), cardPath: null };
  }

  const score = buildScore(summary.daily, scope);
  const ranged = summarizeRange(summary.daily, scope);
  const top = pickTopModel(summary.daily);

  const roast = pickRoast({
    ...score,
    totalSessions: ranged.totalSessions,
    activeDays: ranged.activeDays,
    uniqueModels: ranged.uniqueModels,
    cacheReadTokens: ranged.totalCacheReadTokens,
    cacheWriteTokens: ranged.totalCacheWriteTokens,
    topModel: top.model,
  });

  process.stdout.write(
    renderReveal({
      score,
      totalSessions: ranged.totalSessions,
      activeDays: ranged.activeDays,
      topModel: top.model,
      topModelShare: top.share,
      daysCovered: summary.totalDays,
      roast,
    })
  );

  let cardPath: string | null = null;
  if (writeCard) {
    cardPath = await writeMarkdownCard({
      scope,
      score,
      ranged,
      topModel: top.model,
      topModelShare: top.share,
      roast,
    });
    process.stdout.write(
      `  ${kleur.dim("card")}            ${kleur.cyan(cardPath)}\n\n`
    );
  }

  process.stdout.write(
    `  ${kleur.dim("inspect upload")}  ${kleur.bold("vibeking inspect-upload")}  ${kleur.dim("(see exactly what would be sent)")}\n`
  );
  process.stdout.write(
    `  ${kleur.dim("publish")}         ${kleur.dim().italic("coming in phase 2 — your run is on the homepage by then")}\n\n`
  );

  return { summary, score, cardPath };
}

type CardWriteInput = {
  scope: "weekly" | "monthly" | "all_time";
  score: Score;
  ranged: ReturnType<typeof summarizeRange>;
  topModel: string | null;
  topModelShare: number;
  roast: string;
};

async function writeMarkdownCard(i: CardWriteInput): Promise<string> {
  const dir = join(homedir(), ".vibeking", "cards");
  await mkdir(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const path = join(dir, `${i.scope}-${stamp}.md`);

  const lines = [
    `# VibeKing — ${i.score.title}`,
    "",
    `*${i.score.flair}*`,
    "",
    `- **VibeBurn**: ${i.score.vibeBurn.toLocaleString()} tokens`,
    `- **VibeScore**: ${i.score.vibeScore.toLocaleString()}`,
    `- **Level**: ${i.score.level}`,
    `- **Sessions**: ${i.ranged.totalSessions}`,
    `- **Active days**: ${i.ranged.activeDays}`,
    `- **Streak**: ${i.ranged.streakDays} day(s)`,
    `- **Scope**: ${i.scope}`,
  ];
  if (i.topModel) {
    lines.push(
      `- **Main model**: ${i.topModel} (${Math.round(i.topModelShare * 100)}%)`
    );
  }
  if (i.score.badges.length > 0) {
    lines.push("", "**Badges**");
    for (const b of i.score.badges) lines.push(`- ${b}`);
  }
  lines.push("", "---", "", `> ${i.roast}`, "", `_via vibeking@${CLI_VERSION}_`, "");

  await writeFile(path, lines.join("\n"), "utf8");
  return path;
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
    costUsd: 0,
    scoringVersion: SCORING_VERSION,
  };
}
