import pc from "picocolors";
import * as v from "valibot";
import { LeagueResponseSchema } from "@vibeking/core";
import { requireAuthedConfig } from "../util/requireAuth.js";

export async function runJoinLeague(
  slug: string | undefined,
  code: string | undefined
): Promise<void> {
  const c = pc;
  if (!slug) {
    process.stdout.write(
      `\n  ${c.red("✕")} usage: ${c.bold("vibeking join <slug> [--code <code>]")}\n\n`
    );
    process.exitCode = 1;
    return;
  }

  const cfg = await requireAuthedConfig();
  if (!cfg) return;

  const res = await fetch(
    `${cfg.apiUrl}/v1/leagues/${encodeURIComponent(slug)}/join`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        authorization: `Bearer ${cfg.token}`,
      },
      body: JSON.stringify(code ? { code } : {}),
    }
  );

  if (res.status === 403) {
    process.stdout.write(
      `\n  ${c.red("✕")} this league is private. pass ${c.bold("--code <inviteCode>")}.\n\n`
    );
    process.exitCode = 1;
    return;
  }
  if (res.status === 404) {
    process.stdout.write(
      `\n  ${c.red("✕")} league ${c.bold(slug)} not found.\n\n`
    );
    process.exitCode = 1;
    return;
  }
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    process.stdout.write(
      `\n  ${c.red("✕")} join failed (HTTP ${res.status})\n  ${c.dim(text.slice(0, 500))}\n\n`
    );
    process.exitCode = 1;
    return;
  }

  const body = v.parse(LeagueResponseSchema, await res.json());
  const url = `${cfg.webUrl}/l/${body.league.slug}`;

  process.stdout.write(
    `\n  ${c.green("✓")} joined ${c.bold(body.league.name)}  ${c.dim(`(${body.league.memberCount} member${body.league.memberCount === 1 ? "" : "s"})`)}\n` +
      `  ${c.dim("league page")}   ${c.cyan(url)}\n\n`
  );
}
