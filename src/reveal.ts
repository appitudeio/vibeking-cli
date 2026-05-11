import pc from "picocolors";
import { formatBurn } from "./core/index.js";

// The offline reveal is intentionally thin: it shows observed facts and tells
// the user to publish for the official title, rank, roast, card, and leagues.
// Anything official-looking belongs in publish.ts, where it renders the
// server's canonical response. The CLI is the trust layer, not the game.

export type RevealInput = {
  scope: "weekly" | "monthly" | "all_time";
  tokens: number;
  sessions: number;
  activeDays: number;
  topModel: string | null;
  topModelShare: number;
};

export function renderReveal(i: RevealInput): string {
  const c = pc;
  const lines: string[] = [];

  lines.push("");
  lines.push(`  ${c.bold("vibeking")}  ${c.dim(`${scopeLabel(i.scope)} scan complete`)}`);
  lines.push("");

  lines.push(`  ${c.dim("Tokens")}         ${c.bold(formatBurn(i.tokens))}`);
  lines.push(`  ${c.dim("Sessions")}       ${i.sessions.toLocaleString()}`);
  lines.push(`  ${c.dim("Active days")}    ${i.activeDays}`);
  if (i.topModel) {
    lines.push(
      `  ${c.dim("Main weapon")}    ${i.topModel} ${c.dim(`(${Math.round(i.topModelShare * 100)}%)`)}`
    );
  }
  lines.push("");

  lines.push(`  ${c.bold("You have data worth publishing.")}`);
  lines.push("");

  lines.push(`  ${c.dim("Publish to see your title, rank, roast, card, and leagues:")}`);
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

function scopeLabel(scope: RevealInput["scope"]): string {
  switch (scope) {
    case "weekly":
      return "weekly";
    case "monthly":
      return "monthly";
    case "all_time":
      return "all-time";
  }
}
