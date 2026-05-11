import pc from "picocolors";
import { buildPayloadFromScanOrExit } from "../buildPayload.js";

export async function runInspectUpload(): Promise<void> {
  process.stdout.write(
    [
      "",
      `  ${pc.bold(pc.black(pc.bgYellow(" inspect-upload ")))}  ${pc.dim("the exact JSON that would be sent")}`,
      "",
    ].join("\n") + "\n"
  );

  const payload = await buildPayloadFromScanOrExit({
    heading: "payload would fail server-side validation",
  });
  if (!payload) return;

  process.stdout.write(JSON.stringify(payload, null, 2) + "\n\n");
  process.stdout.write(
    `  ${pc.green("✓")} ${pc.dim("only token counts, dates, model breakdowns. no prompts, code, or paths.")}\n\n`
  );
}
