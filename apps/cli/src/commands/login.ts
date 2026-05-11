import kleur from "kleur";
import open from "open";
import { readConfig, writeConfig } from "../util/config.js";

const POLL_INTERVAL_MS = 2000;
const POLL_MAX_MS = 10 * 60_000; // 10 minutes — matches server TTL

export async function runLogin(opts: { open?: boolean } = {}): Promise<void> {
  const c = kleur;
  const cfg = await readConfig();

  process.stdout.write(
    `\n  ${c.bgYellow().black().bold(" vibeking login ")}  ${c.dim("github oauth via " + cfg.webUrl)}\n\n`
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
      await open(verifyUrl);
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

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
