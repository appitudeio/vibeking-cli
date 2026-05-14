import pc from "picocolors";
import { buildPayloadFromScan, printValiError } from "../buildPayload.js";
import { readConfig } from "../config.js";

// Local-only command: shows what /v1/scan WOULD receive. If the user
// has a cached installationId, surface it so the inspected payload
// matches what a real publish would send. If not, use a placeholder
// — the local view never hits the network, so the placeholder doesn't
// trigger a registration.
const INSTALLATION_ID_PLACEHOLDER = "inst_inspect_placeholder";

export async function runInspectUpload(): Promise<void> {
  process.stdout.write(
    [
      "",
      `  ${pc.bold(pc.black(pc.bgYellow(" inspect-upload ")))}  ${pc.dim("the exact JSON that would be sent")}`,
      "",
    ].join("\n") + "\n"
  );

  const cfg = await readConfig();
  const installationId =
    cfg.installationId && cfg.installationHost === cfg.apiUrl
      ? cfg.installationId
      : INSTALLATION_ID_PLACEHOLDER;

  const result = await buildPayloadFromScan({ installationId });
  if (!result.ok) {
    printValiError("payload would fail server-side validation", result.valiError);
    process.exitCode = 1;
    return;
  }

  process.stdout.write(JSON.stringify(result.payload, null, 2) + "\n\n");
  process.stdout.write(
    `  ${pc.green("✓")} ${pc.dim("only counts and ratios — tokens, tools, sessions, files, lines, hooks, skills, subagents. no prompts, code, or paths.")}\n\n`
  );
}
