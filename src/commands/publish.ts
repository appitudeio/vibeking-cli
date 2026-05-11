import pc from "picocolors";
import { isAuthRejection, requireAuthedConfig } from "../util/config.js";
import { buildPayloadFromScanOrExit } from "../util/buildPayload.js";

export async function runPublish(): Promise<void> {
  const cfg = await requireAuthedConfig();
  if (!cfg) return;

  const payload = await buildPayloadFromScanOrExit({
    heading: "local data would fail server-side validation",
  });
  if (!payload) return;
  if (payload.daily.length === 0) {
    process.stdout.write(
      `\n  ${pc.red("✕")} no Claude Code sessions found in ~/.claude/projects.\n\n`
    );
    process.exitCode = 1;
    return;
  }

  process.stdout.write(
    `\n  ${pc.dim("uploading")}  ${payload.daily.length} day(s) of aggregates  ${pc.dim("→")} ${cfg.apiUrl}\n`
  );

  const res = await fetch(`${cfg.apiUrl}/v1/scan`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      authorization: `Bearer ${cfg.token}`,
    },
    body: JSON.stringify(payload),
  });

  if (isAuthRejection(res)) return;
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    process.stdout.write(
      `\n  ${pc.red("✕")} publish failed (HTTP ${res.status})\n  ${pc.dim(text.slice(0, 500))}\n\n`
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
    `  ${pc.green("✓")} ${pc.bold("published")}\n\n` +
      `  ${pc.dim("title")}      ${pc.bold(pc.white(pc.bgMagenta(` ${body.score.title} `)))} ${pc.dim(pc.italic(body.score.flair))}\n` +
      `  ${pc.dim("score")}      ${pc.bold(pc.cyan(body.score.vibeScore.toLocaleString()))}\n` +
      `  ${pc.dim("level")}      ${pc.bold(pc.magenta(String(body.score.level)))}\n` +
      `  ${pc.dim("profile")}    ${pc.cyan(profileUrl)}\n\n`
  );
}
