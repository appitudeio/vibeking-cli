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

// Cap upper bound at 30 days — if the server emits a wait longer than
// that, treat the response as malformed rather than telling a user to
// wait a month. Lower bound 0 — negative seconds is a server bug, not
// a recoverable state.
const RateLimitedSchema = v.object({
  ok: v.literal(false),
  error: v.literal("rate_limited"),
  retryAfterSeconds: v.pipe(
    v.number(),
    v.integer(),
    v.minValue(0),
    v.maxValue(30 * 86400)
  ),
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
 *
 * Sanitizes for the platform edge cases that bit us in /recheck:deep #5:
 * - empty hostname (misconfigured Linux containers, K8s without
 *   `hostname` set) → "unknown-host" so the label isn't a bare " · darwin"
 * - control bytes (NUL / CR / LF) on some platforms → replaced with "?"
 *   so the server doesn't store a string that breaks log greps later
 * - host part capped at 64 chars so a pathological hostname can't crowd
 *   out the platform/version suffix in the 128-char overall budget
 *
 * Not exported — only the same-file caller `ensureInstallation` uses it.
 */
function deriveInstallationLabel(): string {
  const rawHost = hostname().trim();
  const sanitizedHost = (rawHost || "unknown-host")
    .replace(/[\x00-\x1f]/g, "?")
    .slice(0, 64);
  const label = `${sanitizedHost} · ${platform()}/${arch()} · vibeking-cli/${CLI_VERSION}`;
  return label.slice(0, 128);
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
  if (
    !opts.forceRegister &&
    cfg.installationId &&
    cfg.installationHost === cfg.apiUrl
  ) {
    return { installationId: cfg.installationId, cfg };
  }

  let res: Response;
  try {
    res = await fetch(`${cfg.apiUrl}/v1/installations/register`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        authorization: `Bearer ${cfg.token}`,
      },
      body: JSON.stringify({ label: deriveInstallationLabel() }),
    });
  } catch (err) {
    // fetch() throws on DNS / TLS / network failures. Convert to a typed
    // CLI error so the user sees a friendly message instead of a stack.
    const reason = err instanceof Error ? err.message : String(err);
    throw new InstallationRegistrationError(
      `installation registration network error: ${reason}`,
      { code: "http_error" }
    );
  }

  if (res.status === 429) {
    const body = await safeJson(res);
    const parsed = body === null ? null : v.safeParse(RateLimitedSchema, body);
    if (parsed && parsed.success) {
      throw new InstallationRegistrationError(
        formatRateLimitMessage(parsed.output),
        {
          code: "rate_limited",
          retryAfterSeconds: parsed.output.retryAfterSeconds,
        }
      );
    }
    // Malformed 429 body (empty / non-JSON / wrong shape). Surface as
    // rate_limited with no retryAfter — caller's `instanceof` check
    // still works, error category is honest, no SyntaxError to user.
    throw new InstallationRegistrationError(
      `installation registration rate-limited (HTTP 429, no parseable body).`,
      { code: "rate_limited" }
    );
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "<no body>");
    throw new InstallationRegistrationError(
      `installation registration failed (HTTP ${res.status}): ${text.slice(0, 300)}`,
      { code: "http_error" }
    );
  }

  const body = await safeJson(res);
  const parsed = body === null ? null : v.safeParse(RegisterResponseSchema, body);
  if (!parsed || !parsed.success) {
    throw new InstallationRegistrationError(
      `installation registration succeeded (HTTP ${res.status}) but server response was malformed.`,
      { code: "http_error" }
    );
  }
  const nextCfg: CliConfig = {
    ...cfg,
    installationId: parsed.output.installationId,
    installationHost: cfg.apiUrl,
  };
  await writeConfig(nextCfg);
  return { installationId: parsed.output.installationId, cfg: nextCfg };
}

/** `res.json()` raw-throws SyntaxError on non-JSON bodies. Wrap once here
 *  so every caller can branch on `null` for "body unusable." */
async function safeJson(res: Response): Promise<unknown | null> {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

/** Humanize the wait. < 60s → seconds; < 1h → minutes; otherwise hours.
 *  Prefer the server's `message` field when present (the server has more
 *  context for tailoring per cap type — see plan §3). */
function formatRateLimitMessage(body: {
  retryAfterSeconds: number;
  message?: string | undefined;
}): string {
  if (body.message) return body.message;
  const s = body.retryAfterSeconds;
  if (s < 60) return `installation registration rate-limited. Retry in ${s}s.`;
  if (s < 3600) {
    return `installation registration rate-limited. Retry in ~${Math.ceil(s / 60)}m.`;
  }
  return `installation registration rate-limited. Retry in ~${Math.ceil(s / 3600)}h.`;
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
