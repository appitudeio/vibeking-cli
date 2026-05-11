import * as v from "valibot";
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

const ModelBreakdownSchema = v.pipe(
  v.record(
    v.pipe(
      v.string(),
      v.regex(
        MODEL_KEY_REGEX,
        "model keys must match /^[a-z0-9._:/-]{1,64}$/i — prompt text and file paths cannot be used as keys"
      )
    ),
    v.pipe(v.number(), v.minValue(0), v.maxValue(1))
  ),
  v.check(
    (obj) => Object.keys(obj).length <= 32,
    "modelBreakdown supports at most 32 keys per day"
  )
);

const DailyAggregateSchema = v.strictObject({
  date: v.pipe(
    v.string(),
    v.regex(ISO_DATE_REGEX, "date must be YYYY-MM-DD")
  ),
  inputTokens: v.pipe(
    v.number(),
    v.integer(),
    v.minValue(0),
    v.maxValue(MAX_TOKENS_PER_FIELD)
  ),
  outputTokens: v.pipe(
    v.number(),
    v.integer(),
    v.minValue(0),
    v.maxValue(MAX_TOKENS_PER_FIELD)
  ),
  cacheReadTokens: v.pipe(
    v.number(),
    v.integer(),
    v.minValue(0),
    v.maxValue(MAX_TOKENS_PER_FIELD)
  ),
  cacheWriteTokens: v.pipe(
    v.number(),
    v.integer(),
    v.minValue(0),
    v.maxValue(MAX_TOKENS_PER_FIELD)
  ),
  sessions: v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(1_000_000)),
  modelBreakdown: ModelBreakdownSchema,
}); // strictObject rejects unknown per-day keys (leaked file paths, etc.)

export const UploadPayloadSchema = v.strictObject({
  schemaVersion: v.literal(1),
  source: v.literal("claude_code"),
  cliVersion: v.pipe(
    v.string(),
    v.regex(CLI_VERSION_REGEX, "cliVersion must be semver-ish")
  ),
  scannedAt: v.pipe(v.string(), v.isoTimestamp()),
  daily: v.pipe(v.array(DailyAggregateSchema), v.maxLength(366)),
}); // strictObject rejects unknown top-level keys (leaked prompts, etc.)

export type UploadPayload = v.InferOutput<typeof UploadPayloadSchema>;

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
  return v.parse(UploadPayloadSchema, payload);
}
