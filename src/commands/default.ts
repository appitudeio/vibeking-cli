import pc from "picocolors";
import type { Scope } from "../core/types.js";
import { scanClaudeCode } from "../scanner.js";
import { renderReveal, renderEmptyState } from "../reveal.js";
import { readConfig, tokenMatchesHost, writeConfig } from "../util/config.js";
import { confirm } from "../util/prompt.js";
import { runLogin } from "./auth.js";
import { runPublish } from "./publish.js";
import { computeRevealInput } from "./scan.js";

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
