import pc from "picocolors";
import { requireAuthedConfig } from "../util/requireAuth.js";
import { buildPayloadFromScanOrExit } from "../util/buildPayload.js";

export async function runPublish(): Promise<void> {
  const c = pc;
  const cfg = await requireAuthedConfig();
  if (!cfg) return;

  // Shared with `inspect-upload` — same payload, same validation, same
  // ZodError UX. The two commands cannot drift.
  const payload = await buildPayloadFromScanOrExit({
    heading: "local data would fail server-side validation",
  });
  if (!payload) return;
  if (payload.daily.length === 0) {
    process.stdout.write(
      `\n  ${c.red("✕")} no Claude Code sessions found in ~/.claude/projects.\n\n`
    );
    process.exitCode = 1;
    return;
  }

  process.stdout.write(
    `\n  ${c.dim("uploading")}  ${payload.daily.length} day(s) of aggregates  ${c.dim("→")} ${cfg.apiUrl}\n`
  );

  const res = await fetch(`${cfg.apiUrl}/v1/scan`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      authorization: `Bearer ${cfg.token}`,
    },
    body: JSON.stringify(payload),
  });

  if (res.status === 401) {
    process.stdout.write(
      `\n  ${c.red("✕")} token rejected. run ${c.bold("vibeking login")} again.\n\n`
    );
    process.exitCode = 1;
    return;
  }
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    process.stdout.write(
      `\n  ${c.red("✕")} publish failed (HTTP ${res.status})\n  ${c.dim(text.slice(0, 500))}\n\n`
    );
    process.exitCode = 1;
    return;
  }

  const body = (await res.json()) as {
    ok: true;
    scope: string;
    score: {
      vibeBurn: number;
      vibeScore: number;
      level: number;
      title: string;
      flair: string;
      badges: string[];
    };
  };

  const handle = cfg.handle ?? cfg.userId ?? "(your handle)";
  const profileUrl = `${cfg.webUrl}/u/${handle}`;

  process.stdout.write(
    `  ${c.green("✓")} ${c.bold("published")}\n\n` +
      `  ${c.dim("title")}      ${c.bold(c.white(c.bgMagenta(` ${body.score.title} `)))} ${c.dim(c.italic(body.score.flair))}\n` +
      `  ${c.dim("score")}      ${c.bold(c.cyan(body.score.vibeScore.toLocaleString()))}\n` +
      `  ${c.dim("level")}      ${c.bold(c.magenta(String(body.score.level)))}\n` +
      `  ${c.dim("profile")}    ${c.cyan(profileUrl)}\n\n`
  );
}
