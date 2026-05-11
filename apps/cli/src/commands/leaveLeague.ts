import kleur from "kleur";
import { requireAuthedConfig } from "../util/requireAuth.js";

export async function runLeaveLeague(slug: string | undefined): Promise<void> {
  const c = kleur;
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
