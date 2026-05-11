import pc from "picocolors";
import * as v from "valibot";
import { buildUploadPayload, type UploadPayload } from "../core/redaction.js";
import { scanClaudeCode } from "../scanner.js";
import { CLI_VERSION } from "../version.js";

// Shared by `publish` and `inspect-upload` so the two commands can't drift:
// what inspect-upload prints is what publish would POST.

export async function buildPayloadFromScan(): Promise<UploadPayload> {
  const summary = await scanClaudeCode();
  return buildUploadPayload({
    source: "claude_code",
    cliVersion: CLI_VERSION,
    daily: summary.daily,
  });
}

export async function buildPayloadFromScanOrExit(opts: {
  heading: string;
}): Promise<UploadPayload | null> {
  try {
    return await buildPayloadFromScan();
  } catch (err) {
    if (err instanceof v.ValiError) {
      process.stdout.write(`\n  ${pc.red("✕")} ${opts.heading}:\n`);
      for (const issue of err.issues) {
        const path = v.getDotPath(issue) ?? "";
        process.stdout.write(`    - ${path}: ${issue.message}\n`);
      }
      process.stdout.write("\n");
      process.exitCode = 1;
      return null;
    }
    throw err;
  }
}
