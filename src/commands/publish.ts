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
import { assertNever } from "../assertNever.js";

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

// Mirrors @vibeking/core's InstallationErrorCodeSchema. Single source
// for the type union AND the runtime check — adding a code here forces
// the runPublish switch's `never` exhaustiveness to fail.
const INSTALLATION_ERROR_CODES = [
  "installation_required",
  "installation_unknown",
  "installation_not_owned",
  "installation_revoked",
] as const;
type InstallationErrorCode = (typeof INSTALLATION_ERROR_CODES)[number];

function isInstallationErrorCode(s: string): s is InstallationErrorCode {
  return (INSTALLATION_ERROR_CODES as readonly string[]).includes(s);
}

// Permissive error envelope — accepts any string `error` code. The
// installation-error vs unknown-server-error split happens at the
// `isInstallationErrorCode` narrowing in submitScan, not via two schemas.
const ErrorEnvelopeSchema = v.object({
  ok: v.literal(false),
  error: v.string(),
  message: v.optional(v.string()),
});

type SubmitOutcome =
  | { kind: "ok"; body: v.InferOutput<typeof PublishResponseSchema> }
  | { kind: "auth_rejected" }
  | {
      kind: "installation_error";
      code: InstallationErrorCode;
      message: string;
    }
  | { kind: "unknown_server_error"; code: string; message: string }
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
    const rawBody = await res.text().catch(() => "<no body>");
    let json: unknown;
    try {
      json = JSON.parse(rawBody);
    } catch {
      return { kind: "other_http_error", status: res.status, body: rawBody };
    }
    const parsed = v.safeParse(ErrorEnvelopeSchema, json);
    if (!parsed.success) {
      return { kind: "other_http_error", status: res.status, body: rawBody };
    }
    const { error: code, message } = parsed.output;
    if (isInstallationErrorCode(code)) {
      return {
        kind: "installation_error",
        code,
        message: message ?? "",
      };
    }
    return {
      kind: "unknown_server_error",
      code,
      message: message ?? "<no message>",
    };
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
    switch (outcome.code) {
      case "installation_required":
      case "installation_unknown":
        // The retry above already ran and either succeeded or fell
        // through to here. If we're here, the retry didn't help.
        process.stdout.write(`\n  ${pc.red("✕")} ${outcome.message}\n\n`);
        process.exitCode = 1;
        return;
      case "installation_revoked":
        // Hard stop. Do NOT auto-re-register — user revoked, respect it.
        process.stdout.write(
          `\n  ${pc.red("✕")} this installation was revoked.\n` +
            `  ${pc.dim("visit")} ${pc.cyan(`${cfg.webUrl}/settings`)} ${pc.dim("to manage installations,")}\n` +
            `  ${pc.dim("or run")} ${pc.bold("vibeking installations reset")} ${pc.dim("to register a fresh installation.")}\n\n`
        );
        process.exitCode = 1;
        return;
      case "installation_not_owned":
        // Forensic signal — the locally-cached id belongs to a different
        // user. Clear locally so a follow-up scan registers fresh, but
        // stop THIS scan so the cross-tenant pattern is visible in the
        // server's audit log.
        cfg = await clearCachedInstallation(cfg);
        process.stdout.write(
          `\n  ${pc.red("✕")} this installation is registered to a different account.\n` +
            `  ${pc.dim("if you copied a config from another machine, run")} ${pc.bold("vibeking publish")} ${pc.dim("again to register fresh.")}\n\n`
        );
        process.exitCode = 1;
        return;
      default:
        return assertNever(outcome);
    }
  }

  if (outcome.kind === "unknown_server_error") {
    // Server returned a typed envelope with a code the CLI doesn't know.
    // Surface the message cleanly — likely means the server is ahead
    // of this CLI version and the user needs to upgrade.
    process.stdout.write(
      `\n  ${pc.red("✕")} server returned unknown error code ${pc.bold(outcome.code)}.\n` +
        `  ${pc.dim(outcome.message)}\n` +
        `  ${pc.dim("upgrade the CLI:")} ${pc.bold("npm i -g vibeking@latest")}\n\n`
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
