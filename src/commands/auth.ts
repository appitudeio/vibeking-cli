import pc from "picocolors";
import * as v from "valibot";
import {
  clearAuth,
  isAuthRejection,
  readConfig,
  requireAuthedConfig,
  writeConfig,
} from "../config.js";
import { openUrl } from "../openUrl.js";

const POLL_INTERVAL_MS = 2000;
const POLL_MAX_MS = 10 * 60_000; // matches the server's device-code TTL

const StartResponseSchema = v.object({
  code: v.string(),
  userCode: v.string(),
  verifyUrl: v.string(),
  expiresAt: v.string(),
});

const PollResponseSchema = v.union([
  v.object({ ok: v.literal(true), status: v.literal("pending") }),
  v.object({
    ok: v.literal(true),
    status: v.literal("approved"),
    token: v.string(),
    userId: v.string(),
  }),
]);

const WhoamiResponseSchema = v.object({
  ok: v.literal(true),
  user: v.object({
    id: v.string(),
    handle: v.nullable(v.string()),
    name: v.string(),
    country: v.nullable(v.string()),
  }),
});

export async function runLogin(opts: { open?: boolean } = {}): Promise<void> {
  const cfg = await readConfig();

  process.stdout.write(
    `\n  ${pc.bold(pc.black(pc.bgYellow(" vibeking login ")))}  ${pc.dim("github oauth via " + cfg.webUrl)}\n\n`
  );

  const startRes = await fetch(`${cfg.apiUrl}/v1/cli/start`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  });
  if (!startRes.ok) {
    throw new Error(`failed to start login: HTTP ${startRes.status}`);
  }
  const { code, userCode, verifyUrl, expiresAt } = v.parse(
    StartResponseSchema,
    await startRes.json()
  );

  process.stdout.write(
    `  ${pc.dim("verify code")}    ${pc.bold(userCode)}\n` +
      `  ${pc.dim("verify url")}     ${pc.cyan(verifyUrl)}\n` +
      `  ${pc.dim("expires at")}     ${new Date(expiresAt).toLocaleTimeString()}\n\n` +
      `  ${pc.dim("opening your browser...")}\n\n`
  );

  if (opts.open !== false) {
    try {
      await openUrl(verifyUrl);
    } catch {
      // user can paste the URL manually
    }
  }

  const startedAt = Date.now();
  let dotCount = 0;
  while (Date.now() - startedAt < POLL_MAX_MS) {
    await sleep(POLL_INTERVAL_MS);

    const pollRes = await fetch(`${cfg.apiUrl}/v1/cli/poll`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
    });

    if (pollRes.status === 404 || pollRes.status === 410) {
      throw new Error(`login request expired or invalid (${pollRes.status})`);
    }
    if (!pollRes.ok) {
      continue;
    }

    const result = v.parse(PollResponseSchema, await pollRes.json());

    if (result.status === "pending") {
      dotCount = (dotCount + 1) % 4;
      process.stdout.write(
        `\r  ${pc.dim("waiting for approval" + ".".repeat(dotCount).padEnd(3))}`
      );
      continue;
    }

    process.stdout.write("\r" + " ".repeat(40) + "\r");
    await writeConfig({
      ...cfg,
      token: result.token,
      tokenHost: cfg.apiUrl,
      userId: result.userId,
    });

    process.stdout.write(
      `  ${pc.green("✓")} ${pc.bold("logged in")}  ${pc.dim("(token saved to ~/.vibeking/config.json)")}\n\n`
    );
    return;
  }

  throw new Error("login timed out — run `vibeking login` to try again");
}

export async function runLogout(): Promise<void> {
  await clearAuth();
  process.stdout.write(
    `\n  ${pc.green("✓")} ${pc.bold("logged out")}  ${pc.dim("(token removed)")}\n\n`
  );
}

export async function runWhoami(): Promise<void> {
  const cfg = await requireAuthedConfig();
  if (!cfg) return;

  const res = await fetch(`${cfg.apiUrl}/v1/whoami`, {
    headers: { authorization: `Bearer ${cfg.token}` },
  });

  if (isAuthRejection(res)) return;

  if (!res.ok) {
    process.stdout.write(
      `\n  ${pc.red("✕")} whoami failed (HTTP ${res.status})\n\n`
    );
    process.exitCode = 1;
    return;
  }

  const body = v.parse(WhoamiResponseSchema, await res.json());

  process.stdout.write(
    `\n  ${pc.dim("user id")}   ${body.user.id}\n` +
      `  ${pc.dim("handle")}    ${pc.bold(body.user.handle ?? "(not set)")}\n` +
      `  ${pc.dim("name")}      ${body.user.name}\n` +
      `  ${pc.dim("country")}   ${body.user.country ?? "(not set)"}\n` +
      `  ${pc.dim("api")}       ${cfg.apiUrl}\n\n`
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
