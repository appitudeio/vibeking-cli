import pc from "picocolors";
import type { Scope, ScanSummary } from "../types.js";
import { scanClaudeCode } from "../scanner.js";
import { animateReveal, renderEmptyState, type RevealInput } from "../reveal.js";
import { pickTopModel } from "../topModel.js";
import { readConfig, tokenMatchesHost, writeConfig } from "../config.js";
import { confirm } from "../prompt.js";
import { startSpinner } from "../spinner.js";
import { SCAN_STATUS_LINES } from "../scanCopy.js";
import { runLogin } from "./auth.js";
import { runPublish } from "./publish.js";

export type ScanOptions = {
  scope?: Scope;
};

export async function runScan(opts: ScanOptions = {}): Promise<void> {
  const scope = opts.scope ?? "weekly";
  const stopSpinner = startSpinner(SCAN_STATUS_LINES);
  let summary: ScanSummary;
  try {
    summary = await scanClaudeCode();
  } finally {
    stopSpinner();
  }

  if (summary.daily.length === 0) {
    process.stdout.write(
      renderEmptyState("No Claude Code sessions found in ~/.claude/projects.")
    );
    return;
  }

  await animateReveal(computeRevealInput(summary, scope));

  process.stdout.write(
    `  ${pc.dim("Publish to see your VibeBurn, title, score, and roast:")}\n` +
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
  const stopSpinner = startSpinner(SCAN_STATUS_LINES);
  let summary: ScanSummary;
  try {
    summary = await scanClaudeCode();
  } finally {
    stopSpinner();
  }

  if (summary.daily.length === 0) {
    process.stdout.write(
      renderEmptyState("No Claude Code sessions found in ~/.claude/projects.")
    );
    return;
  }

  await animateReveal(computeRevealInput(summary, scope));

  let cfg = await readConfig();
  const authed = !!cfg.token && tokenMatchesHost(cfg);
  const needsConsent = !cfg.autoPublish;

  // Non-TTY (CI, piped stdin) can't run an interactive login or prompt.
  if (!process.stdin.isTTY && (!authed || needsConsent)) {
    process.stdout.write(
      `  ${pc.dim("Run")} ${pc.bold("vibeking publish")} ${pc.dim("to upload, or")} ${pc.bold("vibeking scan")} ${pc.dim("to scan only.")}\n\n`
    );
    return;
  }

  if (needsConsent) {
    // Surface inspect-upload BEFORE the consent prompt so users can verify
    // what's about to ship — the trust-but-verify principle the CLI is
    // supposed to embody. If they already opted in (autoPublish: true),
    // we skip this; they've already made the trust decision.
    process.stdout.write(
      `  ${pc.dim("Verify what will ship:")}  ${pc.bold("vibeking inspect-upload")}\n\n`
    );
    const question = authed
      ? "Publish to vibeking.io?"
      : "Sign in with GitHub and publish to vibeking.io?";
    const yes = await confirm(question);
    process.stdout.write("\n");
    if (!yes) return;
  }

  if (!authed) {
    // If runLogin throws (timeout, oauth declined, network), the exception
    // propagates and the consent flag below never gets written. Re-running
    // bare `vibeking` will prompt again — exactly what we want.
    await runLogin({ open: opts.open });
    cfg = await readConfig();
  }

  if (needsConsent) {
    await writeConfig({ ...cfg, autoPublish: true });
  }

  // We already scanned + computed `summary` above; pass it through so
  // publish doesn't re-scan and the user doesn't see the spinner phases
  // run a second time.
  await runPublish(summary);
}

function computeRevealInput(summary: ScanSummary, scope: Scope): RevealInput {
  const cutoff = scopeCutoff(scope);
  const inRange = cutoff
    ? summary.daily.filter((d) => d.date >= cutoff)
    : summary.daily;
  // Headline counts only — no client-side burn approximation since v0.3.
  // VibeBurn is server-priced via the LiteLLM catalog (apps/api owns that);
  // shipping a token-weighted estimate here would diverge from the real
  // number the server returns at publish time. Better to show nothing
  // than a number that lies.
  let sessions = 0;
  for (const d of inRange) sessions += d.sessions;
  const top = pickTopModel(inRange);
  return {
    sessions,
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
