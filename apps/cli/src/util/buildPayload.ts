import kleur from "kleur";
import { z } from "zod";
import { buildUploadPayload, type UploadPayload } from "@vibeking/core";
import { scanClaudeCode } from "../scanners/claudeCode.js";
import { CLI_VERSION } from "../version.js";

/**
 * The single function that turns local Claude Code data into an upload
 * payload. BOTH `vibeking publish` and `vibeking inspect-upload` call
 * this — the JSON printed by inspect-upload is structurally identical
 * to the request body publish would send. If you change this function,
 * both commands change together; they can't drift.
 */
export async function buildPayloadFromScan(): Promise<UploadPayload> {
  const summary = await scanClaudeCode();
  return buildUploadPayload({
    source: "claude_code",
    cliVersion: CLI_VERSION,
    daily: summary.daily,
  });
}

/**
 * Same as buildPayloadFromScan, but catches ZodError (the redaction
 * layer firing on malformed local data) and prints a friendly message
 * before exiting. Use from any command that doesn't want to deal with
 * the catch boilerplate.
 */
export async function buildPayloadFromScanOrExit(opts: {
  heading: string;
}): Promise<UploadPayload | null> {
  const c = kleur;
  try {
    return await buildPayloadFromScan();
  } catch (err) {
    if (err instanceof z.ZodError) {
      process.stdout.write(`\n  ${c.red("✕")} ${opts.heading}:\n`);
      for (const issue of err.issues) {
        process.stdout.write(
          `    - ${issue.path.join(".")}: ${issue.message}\n`
        );
      }
      process.stdout.write("\n");
      process.exitCode = 1;
      return null;
    }
    throw err;
  }
}
