import pc from "picocolors";
import * as v from "valibot";
import {
  isAuthRejection,
  requireAuthedConfig,
  type CliConfig,
} from "../config.js";
import { buildPayloadFromScanOrExit } from "../buildPayload.js";
import {
  ensureInstallation,
  clearCachedInstallation,
  InstallationRegistrationError,
} from "../installation.js";

const PublishResponseSchema = v.object({
  ok: v.literal(true),
  scope: v.string(),
  score: v.object({
    vibeBurn: v.number(),
    vibeScore: v.number(),
    level: v.number(),
    title: v.string(),
    flair: v.string(),
    badges: v.array(v.string()),
  }),
});

// Error responses the server emits from the installation gate at
// /v1/scan. Mirrors @vibeking/core's InstallationErrorCodeSchema; if
// either side adds a new code, both sides must update or the CLI's
// retry/stop logic falls through to a generic HTTP-error message.
const InstallationErrorResponseSchema = v.object({
  ok: v.literal(false),
  error: v.picklist([
    "installation_required",
    "installation_unknown",
    "installation_not_owned",
    "installation_revoked",
  ] as const),
  message: v.string(),
});

type SubmitOutcome =
  | { kind: "ok"; body: v.InferOutput<typeof PublishResponseSchema> }
  | { kind: "auth_rejected" }
  | {
      kind: "installation_error";
      code: v.InferOutput<typeof InstallationErrorResponseSchema>["error"];
      message: string;
    }
  | { kind: "other_http_error"; status: number; body: string };

async function submitScan(
  cfg: CliConfig,
  installationId: string
): Promise<SubmitOutcome> {
  const payload = await buildPayloadFromScanOrExit({
    heading: "local data would fail server-side validation",
    installationId,
  });
  if (!payload) return { kind: "other_http_error", status: 0, body: "" };

  const res = await fetch(`${cfg.apiUrl}/v1/scan`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      authorization: `Bearer ${cfg.token}`,
    },
    body: JSON.stringify(payload),
  });

  if (isAuthRejection(res)) return { kind: "auth_rejected" };

  if (!res.ok) {
    // Try parsing as an installation error first — those carry the
    // typed error code the CLI's retry/stop logic keys off. Fall back to
    // generic HTTP-error reporting if the body doesn't match.
    const rawBody = await res.text().catch(() => "<no body>");
    try {
      const parsed = v.parse(
        InstallationErrorResponseSchema,
        JSON.parse(rawBody)
      );
      return {
        kind: "installation_error",
        code: parsed.error,
        message: parsed.message,
      };
    } catch {
      return { kind: "other_http_error", status: res.status, body: rawBody };
    }
  }

  const body = v.parse(PublishResponseSchema, await res.json());
  return { kind: "ok", body };
}

export async function runPublish(): Promise<void> {
  let cfg = await requireAuthedConfig();
  if (!cfg) return;

  // Resolve installationId (cached or freshly registered).
  let installationId: string;
  try {
    const resolved = await ensureInstallation(cfg);
    installationId = resolved.installationId;
    cfg = resolved.cfg;
  } catch (err) {
    if (err instanceof InstallationRegistrationError) {
      process.stdout.write(
        `\n  ${pc.red("✕")} ${err.message}\n\n`
      );
      process.exitCode = 1;
      return;
    }
    throw err;
  }

  process.stdout.write(
    `\n  ${pc.dim("uploading")}  to ${pc.dim(cfg.apiUrl)}  ${pc.dim("installation")} ${pc.dim(installationId)}\n`
  );

  let outcome = await submitScan(cfg, installationId);

  // installation_required and installation_unknown both mean "the
  // server doesn't recognize this installationId; register a fresh one
  // and retry once." installation_required typically fires when an old
  // CLI build (pre-v6) hits the new server; installation_unknown fires
  // when the server has wiped our id (admin action, DB reset, or the
  // cache is stale). Retry exactly once — looping would mask real
  // errors and could hammer the rate-limit cap.
  if (
    outcome.kind === "installation_error" &&
    (outcome.code === "installation_required" ||
      outcome.code === "installation_unknown")
  ) {
    cfg = await clearCachedInstallation(cfg);
    try {
      const resolved = await ensureInstallation(cfg, { forceRegister: true });
      installationId = resolved.installationId;
      cfg = resolved.cfg;
    } catch (err) {
      if (err instanceof InstallationRegistrationError) {
        process.stdout.write(
          `\n  ${pc.red("✕")} ${err.message}\n\n`
        );
        process.exitCode = 1;
        return;
      }
      throw err;
    }
    outcome = await submitScan(cfg, installationId);
  }

  if (outcome.kind === "auth_rejected") return; // isAuthRejection already printed

  if (outcome.kind === "installation_error") {
    if (outcome.code === "installation_revoked") {
      // Hard stop. Do NOT auto-re-register — the user revoked this
      // installation, so the right answer is "respect the revocation
      // and tell the user how to recover," not "silently make a new id."
      process.stdout.write(
        `\n  ${pc.red("✕")} this installation was revoked.\n` +
          `  ${pc.dim("visit")} ${pc.cyan(`${cfg.webUrl}/settings`)} ${pc.dim("to manage installations,")}\n` +
          `  ${pc.dim("or run")} ${pc.bold("vibeking installations reset")} ${pc.dim("to register a fresh installation.")}\n\n`
      );
      process.exitCode = 1;
      return;
    }
    if (outcome.code === "installation_not_owned") {
      // Forensic signal — the locally-cached id belongs to a different
      // user. Most likely: a user copied their ~/.vibeking config from
      // another machine. Clear the local id so a follow-up scan
      // registers fresh under the current account, but stop THIS scan
      // so the cross-tenant pattern is visible in the audit log.
      cfg = await clearCachedInstallation(cfg);
      process.stdout.write(
        `\n  ${pc.red("✕")} this installation is registered to a different account.\n` +
          `  ${pc.dim("if you copied a config from another machine, run")} ${pc.bold("vibeking publish")} ${pc.dim("again to register fresh.")}\n\n`
      );
      process.exitCode = 1;
      return;
    }
    // installation_required / installation_unknown reached the retry
    // loop above — if we hit them again here, the retry didn't help.
    process.stdout.write(
      `\n  ${pc.red("✕")} ${outcome.message}\n\n`
    );
    process.exitCode = 1;
    return;
  }

  if (outcome.kind === "other_http_error") {
    process.stdout.write(
      `\n  ${pc.red("✕")} publish failed (HTTP ${outcome.status})\n  ${pc.dim(outcome.body.slice(0, 500))}\n\n`
    );
    process.exitCode = 1;
    return;
  }

  const body = outcome.body;
  const handle = cfg.handle ?? cfg.userId ?? "(your handle)";
  const profileUrl = `${cfg.webUrl}/u/${handle}`;

  process.stdout.write(
    `  ${pc.green("✓")} ${pc.bold("published")}\n\n` +
      `  ${pc.dim("title")}      ${pc.bold(pc.white(pc.bgMagenta(` ${body.score.title} `)))} ${pc.dim(pc.italic(body.score.flair))}\n` +
      `  ${pc.dim("score")}      ${pc.bold(pc.cyan(body.score.vibeScore.toLocaleString()))}\n` +
      `  ${pc.dim("level")}      ${pc.bold(pc.magenta(String(body.score.level)))}\n` +
      `  ${pc.dim("profile")}    ${pc.cyan(profileUrl)}\n\n`
  );
}
