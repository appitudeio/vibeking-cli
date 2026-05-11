import kleur from "kleur";
import { requireAuthedConfig } from "../util/requireAuth.js";

export async function runWhoami(): Promise<void> {
  const c = kleur;
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
