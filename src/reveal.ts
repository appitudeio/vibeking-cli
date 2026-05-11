import pc from "picocolors";
import { formatBurn } from "./core/format.js";
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
