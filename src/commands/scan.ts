import pc from "picocolors";
import type { Scope, ScanSummary } from "../types.js";
import { scanClaudeCode } from "../scanner.js";
import { renderReveal, renderEmptyState, type RevealInput } from "../reveal.js";
import { pickTopModel } from "../topModel.js";
import { readConfig, tokenMatchesHost, writeConfig } from "../config.js";
import { confirm } from "../prompt.js";
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

  let cfg = await readConfig();
  const authed = !!cfg.token && tokenMatchesHost(cfg);

  // Non-TTY (CI, piped stdin): we can't run an interactive login or prompt.
  // Only proceed silently if the user already has both a valid token AND
  // persisted `autoPublish: true`.
  if (!process.stdin.isTTY && (!authed || !cfg.autoPublish)) {
    process.stdout.write(
      `  ${pc.dim("Run")} ${pc.bold("vibeking publish")} ${pc.dim("to upload, or")} ${pc.bold("vibeking scan")} ${pc.dim("to scan only.")}\n\n`
    );
    return;
  }

  if (!cfg.autoPublish) {
    const question = authed
      ? "Publish to vibeking.io?"
      : "Sign in with GitHub and publish to vibeking.io?";
    const yes = await confirm(question);
    process.stdout.write("\n");
    if (!yes) return;
  }

  if (!authed) {
    // If login throws (timeout, oauth declined, network), the exception
    // propagates and the consent flag below never gets written. Re-running
    // bare `vibeking` will prompt again — exactly what we want.
    await runLogin({ open: opts.open });
    cfg = await readConfig();
  }

  // Persist consent only after we actually have a usable token. Done last so
  // partial failures upstream can't strand the user with autoPublish=true
  // but no auth.
  if (!cfg.autoPublish) {
    await writeConfig({ ...cfg, autoPublish: true });
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
