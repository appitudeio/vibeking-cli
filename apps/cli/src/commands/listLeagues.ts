import pc from "picocolors";
import * as v from "valibot";
import { MyLeaguesResponseSchema } from "@vibeking/core";
import { requireAuthedConfig } from "../util/requireAuth.js";

export async function runListLeagues(): Promise<void> {
  const c = pc;
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
