import pc from "picocolors";
import { readConfig } from "../config.js";
import { clearCachedInstallation } from "../installation.js";

/**
 * `vibeking installations reset` — wipe the locally-cached installationId
 * + installationHost. The next publish will register a fresh installation
 * against the current apiUrl. Auth token is untouched (installation
 * identity and auth credential are separate; logout is its own command).
 *
 * Surfaced as the recovery hint in `publish.ts` for two cases:
 *   - `installation_revoked`: user revoked this installation; running
 *     reset lets them register a new one without `logout` losing their
 *     leaderboard handle.
 *   - `installation_not_owned`: the cached id belongs to another user
 *     (e.g. config copied from another machine).
 *
 * The CLI cleared the id automatically in both cases too, so calling
 * this command after the error is also a no-op — that's fine.
 */
export async function runInstallationsReset(): Promise<void> {
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

export function runInstallationsHelp(): void {
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
