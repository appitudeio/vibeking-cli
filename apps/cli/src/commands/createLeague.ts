import kleur from "kleur";
import { CreateLeagueResponseSchema } from "@vibeking/core";
import { requireAuthedConfig } from "../util/requireAuth.js";

export async function runCreateLeague(name: string | undefined): Promise<void> {
  const c = kleur;
  if (!name || name.trim().length < 3) {
    process.stdout.write(
      `\n  ${c.red("✕")} usage: ${c.bold("vibeking create-league <name>")}\n\n`
    );
    process.exitCode = 1;
    return;
  }

  const cfg = await requireAuthedConfig();
  if (!cfg) return;

  const res = await fetch(`${cfg.apiUrl}/v1/leagues`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      authorization: `Bearer ${cfg.token}`,
    },
    body: JSON.stringify({ name }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    process.stdout.write(
      `\n  ${c.red("✕")} create-league failed (HTTP ${res.status})\n  ${c.dim(text.slice(0, 500))}\n\n`
    );
    process.exitCode = 1;
    return;
  }

  const body = CreateLeagueResponseSchema.parse(await res.json());

  process.stdout.write(
    `\n  ${c.green("✓")} created ${c.bold(body.league.name)}  ${c.dim(`(${body.league.slug})`)}\n` +
      `  ${c.dim("invite url")}    ${c.cyan(body.inviteUrl)}\n` +
      `  ${c.dim("invite code")}   ${c.bold(body.inviteCode)}\n` +
      `  ${c.dim("join via")}      ${c.bold(`vibeking join ${body.league.slug} --code ${body.inviteCode}`)}\n\n`
  );
}
