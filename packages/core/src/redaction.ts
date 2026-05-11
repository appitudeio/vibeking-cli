import { z } from "zod";
import { ISO_DATE_REGEX } from "./scoring.js";
import type { DailyAggregate, SourceType } from "./types.js";

// ────────────────────────────────────────────────────────────
// UploadPayloadSchema is the SINGLE source of truth for what the
// CLI is allowed to send. Both the CLI (apps/cli/inspectUpload + publish)
// and the API (apps/api/routes/scan) parse against this exact schema.
//
// Any field added here must also be:
//   - rendered by `inspect-upload` (so users can verify it before publish)
//   - covered by tests in redaction.test.ts
// ────────────────────────────────────────────────────────────

/** Model keys must start with an alphanumeric (rejecting leading-slash file
 * paths) and may contain dots, colons, slashes, dashes, underscores after.
 * 1–64 chars. */
const MODEL_KEY_REGEX = /^[a-z0-9][a-z0-9._:/\-]{0,63}$/i;

/** Semver-ish: x.y.z optionally with -prerelease. Keeps cliVersion small. */
const CLI_VERSION_REGEX = /^\d+\.\d+\.\d+(-[a-z0-9.]+)?$/i;

/** Token-field upper bound — high enough for legitimate users, low enough
 * to prevent overflow when summed across 366 days. 1e13 × 4 fields × 366 days
 * stays well under Number.MAX_SAFE_INTEGER. */
const MAX_TOKENS_PER_FIELD = 1e13;

const ModelBreakdownSchema = z
  .record(
    z.string().regex(MODEL_KEY_REGEX, {
      message:
        "model keys must match /^[a-z0-9._:/-]{1,64}$/i — prompt text and file paths cannot be used as keys",
    }),
    z.number().min(0).max(1)
  )
  .refine((obj) => Object.keys(obj).length <= 32, {
    message: "modelBreakdown supports at most 32 keys per day",
  });

const DailyAggregateSchema = z
  .object({
    date: z.string().regex(ISO_DATE_REGEX, {
      message: "date must be YYYY-MM-DD",
    }),
    inputTokens: z.number().int().min(0).max(MAX_TOKENS_PER_FIELD),
    outputTokens: z.number().int().min(0).max(MAX_TOKENS_PER_FIELD),
    cacheReadTokens: z.number().int().min(0).max(MAX_TOKENS_PER_FIELD),
    cacheWriteTokens: z.number().int().min(0).max(MAX_TOKENS_PER_FIELD),
    sessions: z.number().int().min(0).max(1_000_000),
    modelBreakdown: ModelBreakdownSchema,
  })
  .strict(); // reject unknown per-day keys (leaked file paths, etc.)

export const UploadPayloadSchema = z
  .object({
    schemaVersion: z.literal(1),
    source: z.literal("claude_code"),
    cliVersion: z.string().regex(CLI_VERSION_REGEX, {
      message: "cliVersion must be semver-ish",
    }),
    scannedAt: z.string().datetime(),
    daily: z.array(DailyAggregateSchema).max(366),
  })
  .strict(); // reject unknown top-level keys (leaked prompts, etc.)

export type UploadPayload = z.infer<typeof UploadPayloadSchema>;

/**
 * Build the upload payload from local aggregates. This is the ONE function
 * that turns local data into something uploadable.
 */
export function buildUploadPayload(args: {
  source: SourceType;
  cliVersion: string;
  daily: DailyAggregate[];
}): UploadPayload {
  const payload = {
    schemaVersion: 1 as const,
    source: args.source,
    cliVersion: args.cliVersion,
    scannedAt: new Date().toISOString(),
    daily: args.daily.map((d) => ({
      date: d.date,
      inputTokens: d.inputTokens,
      outputTokens: d.outputTokens,
      cacheReadTokens: d.cacheReadTokens,
      cacheWriteTokens: d.cacheWriteTokens,
      sessions: d.sessions,
      modelBreakdown: { ...d.modelBreakdown },
    })),
  };

  // Parse-validate before returning, so callers cannot leak. If the local
  // data violates the schema (e.g. a model name with a colon-prefix that
  // doesn't match), we throw at the source rather than upload garbage.
  return UploadPayloadSchema.parse(payload);
}
