import pc from "picocolors";
import * as v from "valibot";
import {
  CreateLeagueResponseSchema,
  LeagueResponseSchema,
  MyLeaguesResponseSchema,
} from "@vibeking/core";
import { requireAuthedConfig } from "../util/requireAuth.js";

const c = pc;

export async function runListLeagues(): Promise<void> {
  const cfg = await requireAuthedConfig();
  if (!cfg) return;

  const res = await fetch(`${cfg.apiUrl}/v1/me/leagues`, {
    headers: { authorization: `Bearer ${cfg.token}` },
  });
  if (!res.ok) {
    process.stdout.write(
      `\n  ${c.red("✕")} leagues lookup failed (HTTP ${res.status})\n\n`
    );
    process.exitCode = 1;
    return;
  }

  const body = v.parse(MyLeaguesResponseSchema, await res.json());
  if (body.leagues.length === 0) {
    process.stdout.write(
      `\n  ${c.dim("you're not in any leagues yet.")}\n` +
        `  ${c.dim("create one:")} ${c.bold("vibeking create-league <name>")}\n\n`
    );
    return;
  }

  process.stdout.write(
    `\n  ${c.bold(c.black(c.bgYellow(" your leagues ")))}\n\n`
  );
  for (const l of body.leagues) {
    const rank =
      l.myWeeklyRank === null ? c.dim("—") : c.bold(c.yellow(`#${l.myWeeklyRank}`));
    const owner = l.isOwner ? c.dim(" · owner") : "";
    process.stdout.write(
      `  ${rank.padEnd(8)}  ${c.bold(l.name)}  ${c.dim(`/${l.slug}`)} ${c.dim(`· ${l.memberCount} member${l.memberCount === 1 ? "" : "s"}`)}${owner}\n`
    );
  }
  process.stdout.write("\n");
}

export async function runCreateLeague(name: string | undefined): Promise<void> {
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

  const body = v.parse(CreateLeagueResponseSchema, await res.json());

  process.stdout.write(
    `\n  ${c.green("✓")} created ${c.bold(body.league.name)}  ${c.dim(`(${body.league.slug})`)}\n` +
      `  ${c.dim("invite url")}    ${c.cyan(body.inviteUrl)}\n` +
      `  ${c.dim("invite code")}   ${c.bold(body.inviteCode)}\n` +
      `  ${c.dim("join via")}      ${c.bold(`vibeking join ${body.league.slug} --code ${body.inviteCode}`)}\n\n`
  );
}

export async function runJoinLeague(
  slug: string | undefined,
  code: string | undefined
): Promise<void> {
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

export async function runLeaveLeague(slug: string | undefined): Promise<void> {
  if (!slug) {
    process.stdout.write(
      `\n  ${c.red("✕")} usage: ${c.bold("vibeking leave <slug>")}\n\n`
    );
    process.exitCode = 1;
    return;
  }

  const cfg = await requireAuthedConfig();
  if (!cfg) return;

  const res = await fetch(
    `${cfg.apiUrl}/v1/leagues/${encodeURIComponent(slug)}/leave`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        authorization: `Bearer ${cfg.token}`,
      },
    }
  );

  if (res.status === 409) {
    process.stdout.write(
      `\n  ${c.red("✕")} you own this league — transfer or delete is coming. for now, refuse to leave.\n\n`
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
    process.stdout.write(
      `\n  ${c.red("✕")} leave failed (HTTP ${res.status})\n\n`
    );
    process.exitCode = 1;
    return;
  }

  process.stdout.write(`\n  ${c.green("✓")} left ${c.bold(slug)}.\n\n`);
}
