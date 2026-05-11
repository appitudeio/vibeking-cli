import kleur from "kleur";
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
  const c = kleur;
  const cfg = await readConfig();

  if (!cfg.token) {
    process.stdout.write(
      `\n  ${c.red("✕")} not logged in. run ${c.bold("vibeking login")} first.\n\n`
    );
    process.exitCode = 1;
    return null;
  }

  if (!tokenMatchesHost(cfg)) {
    process.stdout.write(
      `\n  ${c.red("✕")} token was issued for ${c.bold(cfg.tokenHost ?? "<unknown>")} but the CLI is currently configured for ${c.bold(cfg.apiUrl)}.\n` +
        `    refusing to send the token to a different host. run ${c.bold("vibeking login")} to re-authenticate against ${c.bold(cfg.apiUrl)}.\n\n`
    );
    process.exitCode = 1;
    return null;
  }

  return cfg;
}
