import pc from "picocolors";
import type { Scope, ScanSummary } from "../core/types.js";
import { scanClaudeCode } from "../scanner.js";
import { renderReveal, renderEmptyState, type RevealInput } from "../reveal.js";
import { pickTopModel } from "../util/topModel.js";
import { readConfig, tokenMatchesHost, writeConfig } from "../util/config.js";
import { confirm } from "../util/prompt.js";
import { runLogin } from "./auth.js";
import { runPublish } from "./publish.js";

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

  process.stdout.write(renderReveal(computeRevealInput(summary, scope)));

  process.stdout.write(
    `  ${pc.dim("Publish to see your title, rank, roast, card, and leagues:")}\n` +
      `    ${pc.bold("vibeking publish")}\n\n` +
      `  ${pc.dim("inspect upload")}  ${pc.bold("vibeking inspect-upload")}  ${pc.dim("(see exactly what would be sent)")}\n\n`
  );
}

/**
 * The bare-`vibeking` flow. Scans, shows the reveal, then orchestrates
 * consent + login (if needed) + publish. After the first explicit `y` the
 * choice is persisted as `autoPublish: true` and the prompt never fires
 * again (until `vibeking logout`).
 */
export async function runDefault(opts: {
  scope?: Scope;
  open?: boolean;
}): Promise<void> {
  const scope = opts.scope ?? "weekly";
  const summary = await scanClaudeCode();

  if (summary.daily.length === 0) {
    process.stdout.write(
      renderEmptyState("No Claude Code sessions found in ~/.claude/projects.")
    );
    return;
  }

  process.stdout.write(renderReveal(computeRevealInput(summary, scope)));

  const cfg = await readConfig();
  const authed = !!cfg.token && tokenMatchesHost(cfg);

  if (cfg.autoPublish !== true) {
    if (!process.stdin.isTTY) {
      process.stdout.write(
        `  ${pc.dim("Run")} ${pc.bold("vibeking publish")} ${pc.dim("to upload, or")} ${pc.bold("vibeking scan")} ${pc.dim("to scan only.")}\n\n`
      );
      return;
    }
    const question = authed
      ? "Publish to vibeking.io?"
      : "Sign in with GitHub and publish to vibeking.io?";
    const yes = await confirm(question);
    process.stdout.write("\n");
    if (!yes) return;
    // Persist consent before login/publish so a transient failure (network,
    // server down) doesn't force the user to re-consent next run.
    await writeConfig({ ...cfg, autoPublish: true });
  }

  if (!authed) {
    await runLogin({ open: opts.open });
  }
  await runPublish();
}

function computeRevealInput(summary: ScanSummary, scope: Scope): RevealInput {
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
  return {
    scope,
    tokens: totals.tokens,
    sessions: totals.sessions,
    activeDays: inRange.length,
    topModel: top.model,
    topModelShare: top.share,
  };
}

function scopeCutoff(scope: Scope): string | null {
  if (scope === "all_time") return null;
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const daysBack = scope === "weekly" ? 6 : 29;
  today.setUTCDate(today.getUTCDate() - daysBack);
  return today.toISOString().slice(0, 10);
}
