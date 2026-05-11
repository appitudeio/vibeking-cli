import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join, dirname } from "node:path";
import pc from "picocolors";

export type CliConfig = {
  /** Resolved at read time from env or production default — never persisted. */
  apiUrl: string;
  /** Resolved at read time from env or production default — never persisted. */
  webUrl: string;
  /** Long-lived token issued by `vibeking login`. */
  token?: string;
  /** Host the token was minted against — used to refuse cross-host token leaks. */
  tokenHost?: string;
  userId?: string;
  handle?: string;
  /**
   * Set to true after the user confirms the first-run "Publish to vibeking.io?"
   * prompt. Subsequent bare `vibeking` invocations publish silently. Cleared
   * by `vibeking logout` (logout = full consent reset).
   */
  autoPublish?: boolean;
};

const CONFIG_PATH = join(homedir(), ".vibeking", "config.json");

// Production defaults. Override per-invocation with VIBEKING_API_URL /
// VIBEKING_WEB_URL — useful for running against a fork or a local dev
// stack (point them at http://localhost:7100 / http://localhost:5173).
function resolveUrls(): Pick<CliConfig, "apiUrl" | "webUrl"> {
  return {
    apiUrl: process.env.VIBEKING_API_URL ?? "https://api.vibeking.io",
    webUrl: process.env.VIBEKING_WEB_URL ?? "https://vibeking.io",
  };
}

// Persisted-config shape. apiUrl/webUrl are deliberately NOT here — they
// resolve from env or built-in defaults on every invocation, so a stale
// file from a localhost dev session can't pin the CLI to the wrong host
// permanently (and silently ship the bearer token there).
type PersistedConfig = {
  token?: string;
  tokenHost?: string;
  userId?: string;
  handle?: string;
  autoPublish?: boolean;
};

export async function readConfig(): Promise<CliConfig> {
  const urls = resolveUrls();
  try {
    const raw = await readFile(CONFIG_PATH, "utf8");
    const parsed = JSON.parse(raw) as PersistedConfig;
    return { ...urls, ...parsed };
  } catch {
    return { ...urls };
  }
}

export async function writeConfig(cfg: CliConfig): Promise<void> {
  await mkdir(dirname(CONFIG_PATH), { recursive: true });
  const persisted: PersistedConfig = {
    token: cfg.token,
    tokenHost: cfg.tokenHost,
    userId: cfg.userId,
    handle: cfg.handle,
    autoPublish: cfg.autoPublish,
  };
  await writeFile(CONFIG_PATH, JSON.stringify(persisted, null, 2), {
    mode: 0o600,
  });
}

export async function clearAuth(): Promise<void> {
  const cfg = await readConfig();
  delete cfg.token;
  delete cfg.tokenHost;
  delete cfg.userId;
  delete cfg.handle;
  delete cfg.autoPublish;
  await writeConfig(cfg);
}

/**
 * True when the currently-resolved apiUrl matches the host the token was
 * minted against. Callers about to send an authenticated request should
 * check this and refuse to send if false — protects against a user
 * changing VIBEKING_API_URL after login and accidentally shipping the
 * bearer token to an attacker-controlled host.
 */
export function tokenMatchesHost(cfg: CliConfig): boolean {
  if (!cfg.token || !cfg.tokenHost) return false;
  return cfg.tokenHost === cfg.apiUrl;
}

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
