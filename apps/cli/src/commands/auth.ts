import pc from "picocolors";
import { clearAuth, readConfig, writeConfig } from "../util/config.js";
import { openUrl } from "../util/openUrl.js";
import { requireAuthedConfig } from "../util/requireAuth.js";

const c = pc;

const POLL_INTERVAL_MS = 2000;
const POLL_MAX_MS = 10 * 60_000; // 10 minutes — matches server TTL

export async function runLogin(opts: { open?: boolean } = {}): Promise<void> {
  const cfg = await readConfig();

  process.stdout.write(
    `\n  ${c.bold(c.black(c.bgYellow(" vibeking login ")))}  ${c.dim("github oauth via " + cfg.webUrl)}\n\n`
  );

  // 1) Ask the API for a code.
  const startRes = await fetch(`${cfg.apiUrl}/v1/cli/start`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  });
  if (!startRes.ok) {
    throw new Error(`failed to start login: HTTP ${startRes.status}`);
  }
  const { code, userCode, verifyUrl, expiresAt } = (await startRes.json()) as {
    code: string;
    userCode: string;
    verifyUrl: string;
    expiresAt: string;
  };

  process.stdout.write(
    `  ${c.dim("verify code")}    ${c.bold(userCode)}\n` +
      `  ${c.dim("verify url")}     ${c.cyan(verifyUrl)}\n` +
      `  ${c.dim("expires at")}     ${new Date(expiresAt).toLocaleTimeString()}\n\n` +
      `  ${c.dim("opening your browser...")}\n\n`
  );

  if (opts.open !== false) {
    try {
      await openUrl(verifyUrl);
    } catch {
      // continue anyway — user can paste the URL manually
    }
  }

  // 2) Poll for approval.
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
      // transient — keep trying
      continue;
    }

    const result = (await pollRes.json()) as
      | { ok: true; status: "pending" }
      | { ok: true; status: "approved"; token: string; userId: string };

    if (result.status === "pending") {
      dotCount = (dotCount + 1) % 4;
      process.stdout.write(
        `\r  ${c.dim("waiting for approval" + ".".repeat(dotCount).padEnd(3))}`
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
      `  ${c.green("✓")} ${c.bold("logged in")}  ${c.dim("(token saved to ~/.vibeking/config.json)")}\n\n`
    );
    return;
  }

  throw new Error("login timed out — run `vibeking login` to try again");
}

export async function runLogout(): Promise<void> {
  await clearAuth();
  process.stdout.write(
    `\n  ${c.green("✓")} ${c.bold("logged out")}  ${c.dim("(token removed)")}\n\n`
  );
}

export async function runWhoami(): Promise<void> {
  const cfg = await requireAuthedConfig();
  if (!cfg) return;

  // Look up our identity from the server. The token alone doesn't tell us
  // the handle/email; we ask the API.
  const res = await fetch(`${cfg.apiUrl}/v1/whoami`, {
    headers: { authorization: `Bearer ${cfg.token}` },
  });

  if (res.status === 401) {
    process.stdout.write(
      `\n  ${c.red("✕")} token rejected. run ${c.bold("vibeking login")} again.\n\n`
    );
    process.exitCode = 1;
    return;
  }

  if (!res.ok) {
    process.stdout.write(
      `\n  ${c.red("✕")} whoami failed (HTTP ${res.status})\n\n`
    );
    process.exitCode = 1;
    return;
  }

  const body = (await res.json()) as {
    ok: true;
    user: { id: string; handle: string | null; name: string; country: string | null };
  };

  process.stdout.write(
    `\n  ${c.dim("user id")}   ${body.user.id}\n` +
      `  ${c.dim("handle")}    ${c.bold(body.user.handle ?? "(not set)")}\n` +
      `  ${c.dim("name")}      ${body.user.name}\n` +
      `  ${c.dim("country")}   ${body.user.country ?? "(not set)"}\n` +
      `  ${c.dim("api")}       ${cfg.apiUrl}\n\n`
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
