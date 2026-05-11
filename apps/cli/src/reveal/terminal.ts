import kleur from "kleur";
import { formatBurn, type Score } from "@vibeking/core";

export type RevealInput = {
  score: Score;
  totalSessions: number;
  activeDays: number;
  topModel: string | null;
  topModelShare: number;
  daysCovered: number;
  roast: string;
};

const CROWN = `       __||__
       \\\\____//
        ('o')
       (\\___/)
        \\___/`;

export function renderReveal(i: RevealInput): string {
  const lines: string[] = [];
  const c = kleur;

  lines.push("");
  lines.push(c.yellow().bold(CROWN));
  lines.push("");
  lines.push(
    c.bold().white("  ") +
      c.bgYellow().black().bold(" VibeKing ") +
      c.dim(`  ${scopeLabel(i.score.scope)} scan complete`)
  );
  lines.push("");
  lines.push(divider());
  lines.push("");

  // Big number
  const burnLabel = c.dim("VibeBurn");
  const burnValue = c.yellow().bold(formatBurn(i.score.vibeBurn));
  lines.push(`  ${burnLabel}        ${burnValue} ${c.dim("tokens")}`);
  lines.push(
    `  ${c.dim("VibeScore")}       ${c.cyan().bold(i.score.vibeScore.toLocaleString())}`
  );
  lines.push(
    `  ${c.dim("Level")}           ${c.magenta().bold(String(i.score.level))}`
  );
  lines.push("");

  // Title — the screenshot moment
  lines.push(`  ${c.dim("Title")}`);
  lines.push(
    `  ${c.bgMagenta().white().bold(` ${i.score.title} `)}  ${c.italic().dim(i.score.flair)}`
  );
  lines.push("");

  // Side stats
  lines.push(`  ${c.dim("Sessions")}        ${i.totalSessions.toLocaleString()}`);
  lines.push(`  ${c.dim("Active days")}     ${i.activeDays}`);
  if (i.topModel) {
    lines.push(
      `  ${c.dim("Main weapon")}     ${i.topModel} ${c.dim(`(${Math.round(i.topModelShare * 100)}%)`)}`
    );
  }

  if (i.score.badges.length > 0) {
    lines.push("");
    lines.push(`  ${c.dim("Badges")}`);
    for (const b of i.score.badges) {
      lines.push(`    ${c.green("✓")} ${b}`);
    }
  }

  lines.push("");
  lines.push(divider());
  lines.push("");
  lines.push(`  ${c.italic().yellow(i.roast)}`);
  lines.push("");

  return lines.join("\n");
}

export function renderEmptyState(reason: string): string {
  const c = kleur;
  return [
    "",
    c.yellow().bold(CROWN),
    "",
    `  ${c.bgYellow().black().bold(" VibeKing ")}  ${c.dim("scan inconclusive")}`,
    "",
    `  ${c.red("✕")} ${reason}`,
    "",
    `  ${c.dim("Run a Claude Code session, then try again.")}`,
    "",
  ].join("\n");
}

export function divider(): string {
  return kleur.dim("  ───────────────────────────────────────────────────────────");
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
