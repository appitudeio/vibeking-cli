import { hostname, platform, arch } from "node:os";
import * as v from "valibot";
import { type CliConfig, writeConfig } from "./config.js";
import { CLI_VERSION } from "./version.js";

const RegisterResponseSchema = v.object({
  ok: v.literal(true),
  installationId: v.pipe(v.string(), v.minLength(1), v.maxLength(64)),
  label: v.string(),
  createdAt: v.string(),
});

const RateLimitedSchema = v.object({
  ok: v.literal(false),
  error: v.literal("rate_limited"),
  retryAfterSeconds: v.number(),
  message: v.optional(v.string()),
});

/**
 * Derive a friendly label for this CLI install. The server stores it
 * verbatim as display text — never trusted for anti-cheat. Includes
 * hostname + platform + arch + CLI version so the user can tell which
 * machine is which on the settings page.
 *
 * `hostname()` may be sensitive (employer-issued machine names, etc.) so
 * we surface it only in the label, never in any anti-cheat signal.
 */
export function deriveInstallationLabel(): string {
  // Trim to 128 chars to stay well under the server's max-label bound.
  const raw = `${hostname()} · ${platform()}/${arch()} · vibeking-cli/${CLI_VERSION}`;
  return raw.slice(0, 128);
}

/**
 * Returns an installationId valid for the current apiUrl. Three cases:
 *
 *   1. Local cache hits AND installationHost matches apiUrl → return it
 *      (warm path — every scan after first run).
 *   2. Local cache miss OR host mismatch → call POST
 *      /v1/installations/register, persist, return.
 *   3. Forced re-register (forceRegister: true) → bypass cache,
 *      register fresh. Used after the server returns
 *      installation_unknown or installation_not_owned so a single retry
 *      recovers.
 *
 * Throws on registration failure with a message the caller can surface.
 * Returns a CliConfig augmented with the resolved installationId — the
 * caller should use this for the immediate request and persist it.
 */
export async function ensureInstallation(
  cfg: CliConfig,
  opts: { forceRegister?: boolean } = {}
): Promise<{ installationId: string; cfg: CliConfig }> {
  const cached =
    !opts.forceRegister &&
    cfg.installationId &&
    cfg.installationHost === cfg.apiUrl;
  if (cached && cfg.installationId) {
    return { installationId: cfg.installationId, cfg };
  }

  const res = await fetch(`${cfg.apiUrl}/v1/installations/register`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      authorization: `Bearer ${cfg.token}`,
    },
    body: JSON.stringify({ label: deriveInstallationLabel() }),
  });

  if (res.status === 429) {
    const body = v.parse(RateLimitedSchema, await res.json());
    throw new InstallationRegistrationError(
      `installation registration rate-limited. Retry in ${body.retryAfterSeconds}s.`,
      { code: "rate_limited", retryAfterSeconds: body.retryAfterSeconds }
    );
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "<no body>");
    throw new InstallationRegistrationError(
      `installation registration failed (HTTP ${res.status}): ${text.slice(0, 300)}`,
      { code: "http_error" }
    );
  }

  const body = v.parse(RegisterResponseSchema, await res.json());
  const nextCfg: CliConfig = {
    ...cfg,
    installationId: body.installationId,
    installationHost: cfg.apiUrl,
  };
  await writeConfig(nextCfg);
  return { installationId: body.installationId, cfg: nextCfg };
}

/**
 * Strip the locally-cached installationId when the server tells us it
 * no longer exists or belongs to someone else. Next call to
 * `ensureInstallation` will mint a fresh id. Does NOT touch the auth
 * token — installation identity and auth credential are separate.
 */
export async function clearCachedInstallation(
  cfg: CliConfig
): Promise<CliConfig> {
  const next: CliConfig = { ...cfg };
  delete next.installationId;
  delete next.installationHost;
  await writeConfig(next);
  return next;
}

type ErrCode = "rate_limited" | "http_error";

export class InstallationRegistrationError extends Error {
  override readonly name = "InstallationRegistrationError";
  readonly code: ErrCode;
  readonly retryAfterSeconds: number | null;
  constructor(
    message: string,
    detail: { code: ErrCode; retryAfterSeconds?: number }
  ) {
    super(message);
    this.code = detail.code;
    this.retryAfterSeconds = detail.retryAfterSeconds ?? null;
  }
}
