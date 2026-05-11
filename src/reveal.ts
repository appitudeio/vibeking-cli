import pc from "picocolors";
import type { Scope } from "./core/types.js";

// The offline reveal is intentionally thin: it shows observed facts and tells
// the user to publish for the official title, rank, roast, card, and leagues.
// Anything official-looking belongs in publish.ts, where it renders the
// server's canonical response. The CLI is the trust layer, not the game.

export type RevealInput = {
  scope: Scope;
  tokens: number;
  sessions: number;
  activeDays: number;
  topModel: string | null;
  topModelShare: number;
};

export function renderReveal(i: RevealInput): string {
  const lines: string[] = [];

  lines.push("");
  lines.push(`  ${pc.bold("vibeking")}  ${pc.dim(`${scopeLabel(i.scope)} scan complete`)}`);
  lines.push("");

  lines.push(`  ${pc.dim("Tokens")}         ${pc.bold(formatBurn(i.tokens))}`);
  lines.push(`  ${pc.dim("Sessions")}       ${i.sessions.toLocaleString()}`);
  lines.push(`  ${pc.dim("Active days")}    ${i.activeDays}`);
  if (i.topModel) {
    lines.push(
      `  ${pc.dim("Main weapon")}    ${i.topModel} ${pc.dim(`(${Math.round(i.topModelShare * 100)}%)`)}`
    );
  }
  lines.push("");

  lines.push(`  ${pc.bold("You have data worth publishing.")}`);
  lines.push("");

  return lines.join("\n");
}

export function renderEmptyState(reason: string): string {
  return [
    "",
    `  ${pc.bold("vibeking")}  ${pc.dim("scan inconclusive")}`,
    "",
    `  ${pc.red("✕")} ${reason}`,
    "",
    `  ${pc.dim("Run a Claude Code session, then try again.")}`,
    "",
  ].join("\n");
}

function scopeLabel(scope: Scope): string {
  switch (scope) {
    case "weekly":
      return "weekly";
    case "monthly":
      return "monthly";
    case "all_time":
      return "all-time";
  }
}

// Compact-burn formatter for share cards, leaderboards, and the terminal
// reveal. Kept aligned with the server-side renderer (same thresholds, same
// rounding) so e.g. 2.5B never shows as 2.50B from one surface but 2.5B from
// another.
function formatBurn(n: number): string {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(2)}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}
