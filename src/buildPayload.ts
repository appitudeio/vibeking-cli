import pc from "picocolors";
import * as v from "valibot";
import { buildUploadPayload, type UploadPayload } from "./redaction.js";
import { scanClaudeCode } from "./scanner.js";
import { startSpinner } from "./spinner.js";
import { SCAN_STATUS_LINES } from "./scanCopy.js";
import type { ScanSummary } from "./types.js";
import { CLI_VERSION } from "./version.js";

// Shared by `publish` and `inspect-upload` so the two commands can't drift:
// what inspect-upload prints is what publish would POST. ValiError details
// are returned to the caller instead of printed inline so the caller can
// stop any in-flight spinner before rendering them.

// Valibot's ValiError is generic over the schema; we don't care which
// schema produced the failure at the printing layer.
export type AnyValiError = v.ValiError<
  v.BaseSchema<unknown, unknown, v.BaseIssue<unknown>>
>;

export type PayloadResult =
  | { ok: true; payload: UploadPayload }
  | { ok: false; valiError: AnyValiError };

export async function buildPayloadFromScan(opts: {
  installationId: string;
  /** Optional pre-scanned summary — when the caller already has one
   *  (e.g. the `vibeking` default flow scans for the reveal then
   *  passes the same summary into publish), skip the scan AND the
   *  spinner so the user doesn't see the same phases run twice. */
  summary?: ScanSummary;
}): Promise<PayloadResult> {
  let summary: ScanSummary;
  if (opts.summary) {
    summary = opts.summary;
  } else {
    const stopSpinner = startSpinner(SCAN_STATUS_LINES);
    try {
      summary = await scanClaudeCode();
    } finally {
      stopSpinner();
    }
  }

  try {
    const payload = buildUploadPayload({
      cliVersion: CLI_VERSION,
      installationId: opts.installationId,
      daily: summary.daily,
    });
    return { ok: true, payload };
  } catch (err) {
    if (err instanceof v.ValiError) {
      return { ok: false, valiError: err };
    }
    throw err;
  }
}

/** Render a Valibot validation error block. Used by both inspect-upload
 *  and the publish `local_validation_failed` path so the two paths stay
 *  byte-identical. Writes to stdout. */
export function printValiError(heading: string, err: AnyValiError): void {
  process.stdout.write(`\n  ${pc.red("✕")} ${heading}:\n`);
  for (const issue of err.issues) {
    const path = v.getDotPath(issue) ?? "";
    process.stdout.write(`    - ${path}: ${issue.message}\n`);
  }
  process.stdout.write("\n");
}
