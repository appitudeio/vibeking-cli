import pc from "picocolors";
import * as v from "valibot";
import {
  isAuthRejection,
  requireAuthedConfig,
  type CliConfig,
} from "../config.js";
import {
  buildPayloadFromScan,
  printValiError,
  type AnyValiError,
} from "../buildPayload.js";
import type { ScanSummary } from "../types.js";
import {
  ensureInstallation,
  clearCachedInstallation,
  InstallationRegistrationError,
} from "../installation.js";
import { openUrl } from "../openUrl.js";
import { startSpinner } from "../spinner.js";
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
  // Server-picked meme line, sourced from @vibeking/db roast rules.
  // Always present on an accepted scan — `vibeking scan` (offline,
  // unauthenticated) is the only path that ends without one.
  roast: v.string(),
  // Reveal receipt. Null when the gate suppressed the reveal
  // (suspicious / excluded verdict) — ceremony is suppressed in that
  // case but the score/title/level still print.
  reveal: v.nullable(
    v.object({
      slug: v.string(),
      url: v.string(),
      archetype: v.string(),
      archetypeLabel: v.string(),
      headlineStat: v.string(),
    })
  ),
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
  // Server's minimum CLI version moved past this build (HTTP 426).
  // Distinct from unknown_server_error so we render a clean upgrade
  // instruction without the "unknown error code" framing — this is an
  // expected, actionable outcome, not a protocol surprise.
  | { kind: "cli_outdated"; message: string }
  | { kind: "unknown_server_error"; code: string; message: string }
  | { kind: "other_http_error"; status: number; body: string }
  // Local Valibot validation failed before the request fired. Carry the
  // error so runPublish can render it AFTER it stops the network spinner
  // (otherwise the spinner overpaints the error block).
  | { kind: "local_validation_failed"; valiError: AnyValiError };

async function submitScan(
  cfg: CliConfig,
  installationId: string,
  presetSummary: ScanSummary | undefined
): Promise<SubmitOutcome> {
  const result = await buildPayloadFromScan({
    installationId,
    summary: presetSummary,
  });
  if (!result.ok) {
    return { kind: "local_validation_failed", valiError: result.valiError };
  }
  const payload = result.payload;

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
    if (code === "cli_outdated") {
      // Server message is self-contained (names the floor + the
      // upgrade command); fall back to a static line only if a future
      // server omits it.
      return {
        kind: "cli_outdated",
        message:
          message ??
          "Your vibeking CLI is out of date. Upgrade: npm i -g vibeking@latest",
      };
    }
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


export async function runPublish(
  presetSummary?: ScanSummary
): Promise<void> {
  let cfg = await requireAuthedConfig();
  if (!cfg) return;

  // Single-line spinner that covers the network leg (installation
  // registration + /v1/scan POST). Fills the dead time between the
  // reveal animation and the URL line. Stopped before any error or
  // success print so the spinner can't overpaint the output.
  const stopSpinner = startSpinner("publishing your burn");

  // Resolve installationId (cached or freshly registered).
  let installationId: string;
  try {
    const resolved = await ensureInstallation(cfg);
    installationId = resolved.installationId;
    cfg = resolved.cfg;
  } catch (err) {
    stopSpinner();
    if (err instanceof InstallationRegistrationError) {
      process.stdout.write(
        `\n  ${pc.red("✕")} ${err.message}\n\n`
      );
      process.exitCode = 1;
      return;
    }
    throw err;
  }

  let outcome = await submitScan(cfg, installationId, presetSummary);

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
      stopSpinner();
      if (err instanceof InstallationRegistrationError) {
        process.stdout.write(
          `\n  ${pc.red("✕")} ${err.message}\n\n`
        );
        process.exitCode = 1;
        return;
      }
      throw err;
    }
    outcome = await submitScan(cfg, installationId, presetSummary);
  }

  // Network work is done; everything below this point prints, so the
  // spinner has to commit-and-stop first.
  stopSpinner();

  if (outcome.kind === "auth_rejected") return; // isAuthRejection already printed

  if (outcome.kind === "local_validation_failed") {
    printValiError(
      "local data would fail server-side validation",
      outcome.valiError
    );
    process.exitCode = 1;
    return;
  }

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

  if (outcome.kind === "cli_outdated") {
    // Expected, actionable: the server deliberately rejected this
    // build. `outcome.message` is self-contained — it already names
    // the required floor AND the upgrade command — so print it as-is
    // without a duplicate CTA line.
    process.stdout.write(
      `\n  ${pc.red("✕")} ${outcome.message}\n\n`
    );
    process.exitCode = 1;
    return;
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

  // The reveal page is the payoff — title, score, level, roast, badges,
  // share card all live there. The terminal's job is to make the user
  // click the link. Anything we spill here (score, archetype, headline,
  // profile URL) competes with that click. Keep the inline output to a
  // single line tease + the CTA.
  //
  // `body.reveal` is null when the anti-cheat gate suppressed the reveal
  // (suspicious / excluded verdict — see ScanRevealDto in @vibeking/core).
  // In that case we still confirm the publish and surface the title so
  // the user knows the upload completed; no URL to drive to.
  if (body.reveal !== null) {
    process.stdout.write(
      `\n  ${pc.yellow("★")} ${pc.bold("see your new ranking →")} ${pc.cyan(body.reveal.url)}\n\n`
    );
    void openUrl(body.reveal.url);
  } else {
    // Anti-cheat suppressed the reveal — no URL to drive to. Confirm
    // the upload landed; the user can investigate on the web settings.
    process.stdout.write(
      `\n  ${pc.green("✓")} ${pc.bold("published")}\n\n`
    );
  }
}
