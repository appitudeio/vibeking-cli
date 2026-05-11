import pc from "picocolors";
import { readConfig, tokenMatchesHost, type CliConfig } from "./config.js";

/**
 * Resolve config and assert we have a usable token for the currently-
 * targeted apiUrl. On failure, prints a friendly message and sets
 * `process.exitCode = 1` — caller should `return` after.
 *
 * Catches two failure modes:
 *   - no token at all (user hasn't run `vibeking login`)
 *   - token was minted against a different host (apiUrl changed via env
 *     var or default flip; refuse to leak the bearer to the new host)
 */
export async function requireAuthedConfig(): Promise<CliConfig | null> {
  const cfg = await readConfig();

  if (!cfg.token) {
    process.stdout.write(
      `\n  ${pc.red("✕")} not logged in. run ${pc.bold("vibeking login")} first.\n\n`
    );
    process.exitCode = 1;
    return null;
  }

  if (!tokenMatchesHost(cfg)) {
    process.stdout.write(
      `\n  ${pc.red("✕")} token was issued for ${pc.bold(cfg.tokenHost ?? "<unknown>")} but the CLI is currently configured for ${pc.bold(cfg.apiUrl)}.\n` +
        `    refusing to send the token to a different host. run ${pc.bold("vibeking login")} to re-authenticate against ${pc.bold(cfg.apiUrl)}.\n\n`
    );
    process.exitCode = 1;
    return null;
  }

  return cfg;
}

/**
 * Detects server-side rejection of an authenticated request. When it
 * returns true, the message is already printed and `process.exitCode` is
 * set — the caller should `return` immediately.
 */
export function isAuthRejection(res: Response): boolean {
  if (res.status === 401) {
    process.stdout.write(
      `\n  ${pc.red("✕")} token rejected. run ${pc.bold("vibeking login")} again.\n\n`
    );
    process.exitCode = 1;
    return true;
  }
  return false;
}
