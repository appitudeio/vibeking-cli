import pc from "picocolors";
import { formatBurn, type Score } from "./core/index.js";

export type RevealInput = {
  score: Score;
  totalSessions: number;
  activeDays: number;
  topModel: string | null;
  topModelShare: number;
  daysCovered: number;
};

// The offline reveal is intentionally thin: it shows observed facts plus a
// provisional "Looks like:" teaser and tells the user to publish for the
// official rank, roast, card, and leagues. Anything official-looking
// (VibeScore, level, badges, roast, fancy title chrome) belongs in
// publish.ts, where it renders the server's canonical response.

export function renderReveal(i: RevealInput): string {
  const c = pc;
  const lines: string[] = [];

  lines.push("");
  lines.push(`  ${c.bold("vibeking")}  ${c.dim(`${scopeLabel(i.score.scope)} scan complete`)}`);
  lines.push("");

  lines.push(`  ${c.dim("Tokens")}         ${c.bold(formatBurn(i.score.vibeBurn))}`);
  lines.push(`  ${c.dim("Sessions")}       ${i.totalSessions.toLocaleString()}`);
  lines.push(`  ${c.dim("Active days")}    ${i.activeDays}`);
  if (i.topModel) {
    lines.push(
      `  ${c.dim("Main weapon")}    ${i.topModel} ${c.dim(`(${Math.round(i.topModelShare * 100)}%)`)}`
    );
  }
  lines.push("");

  lines.push(`  ${c.dim("Looks like:")} ${c.bold(i.score.title)}`);
  lines.push("");

  lines.push(`  ${c.dim("Publish to see your official rank, roast, card, and leagues:")}`);
  lines.push(`    ${c.bold("vibeking publish")}`);
  lines.push("");

  return lines.join("\n");
}

export function renderEmptyState(reason: string): string {
  const c = pc;
  return [
    "",
    `  ${c.bold("vibeking")}  ${c.dim("scan inconclusive")}`,
    "",
    `  ${c.red("✕")} ${reason}`,
    "",
    `  ${c.dim("Run a Claude Code session, then try again.")}`,
    "",
  ].join("\n");
}

function scopeLabel(scope: Score["scope"]): string {
  switch (scope) {
    case "weekly":
      return "weekly";
    case "monthly":
      return "monthly";
    case "all_time":
      return "all-time";
  }
}
