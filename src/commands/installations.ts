import pc from "picocolors";
import { readConfig } from "../config.js";
import { clearCachedInstallation } from "../installation.js";

/** Top-level dispatcher for `vibeking installations [subcommand]`. */
export async function runInstallations(subcommand: string | undefined): Promise<void> {
  if (subcommand === "reset") {
    await runInstallationsReset();
    return;
  }
  runInstallationsHelp();
}

/**
 * Wipe the locally-cached installationId. Auth token is untouched —
 * installation identity and auth credential are separate.
 */
async function runInstallationsReset(): Promise<void> {
  const cfg = await readConfig();
  if (!cfg.installationId) {
    process.stdout.write(
      `\n  ${pc.dim("no cached installation to reset.")}\n` +
        `  ${pc.dim("next publish will register a fresh installation against")} ${pc.bold(cfg.apiUrl)}.\n\n`
    );
    return;
  }
  const oldId = cfg.installationId;
  await clearCachedInstallation(cfg);
  process.stdout.write(
    `\n  ${pc.green("✓")} cleared cached installation ${pc.dim(oldId)}\n` +
      `  ${pc.dim("next publish will register a fresh installation against")} ${pc.bold(cfg.apiUrl)}.\n\n`
  );
}

function runInstallationsHelp(): void {
  process.stdout.write(
    [
      "",
      `  ${pc.bold(pc.black(pc.bgYellow(" vibeking installations ")))}`,
      "",
      `  ${pc.bold("reset")}    wipe the locally-cached installationId so the next`,
      `           publish registers a fresh one. Useful after revocation`,
      `           or when a config was copied from another machine.`,
      "",
    ].join("\n") + "\n"
  );
}
