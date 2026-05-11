import kleur from "kleur";
import { buildPayloadFromScanOrExit } from "../util/buildPayload.js";

export async function runInspectUpload(): Promise<void> {
  const c = kleur;
  process.stdout.write(
    [
      "",
      `  ${c.bgYellow().black().bold(" inspect-upload ")}  ${c.dim("the exact JSON that would be sent")}`,
      "",
    ].join("\n") + "\n"
  );

  // Shares buildPayloadFromScanOrExit with `publish` — what prints here
  // is structurally identical to what publish POSTs (whitespace aside).
  const payload = await buildPayloadFromScanOrExit({
    heading: "payload would fail server-side validation",
  });
  if (!payload) return;

  process.stdout.write(JSON.stringify(payload, null, 2) + "\n\n");
  process.stdout.write(
    `  ${c.green("✓")} ${c.dim("only token counts, dates, model breakdowns. no prompts, code, or paths.")}\n\n`
  );
}
