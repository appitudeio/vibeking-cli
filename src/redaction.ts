import * as v from "valibot";
import type { DailyAggregate, SourceType } from "./types.js";

/** Matches a YYYY-MM-DD string; doesn't validate the date itself. */
export const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

/** True when the input is a well-formed YYYY-MM-DD string. */
export function isIsoDate(s: string): boolean {
  return ISO_DATE_REGEX.test(s);
}

// ────────────────────────────────────────────────────────────
// UploadPayloadSchema is the SINGLE source of truth for what the
// CLI is allowed to send. Both the CLI (commands/inspectUpload + publish)
// and the server's scan route parse against this exact schema.
//
// Any field added here must also be:
//   - rendered by `inspect-upload` (so users can verify it before publish)
//   - covered by tests in redaction.test.ts
//   - reflected in the privacy text (help.ts, README.md, inspectUpload.ts)
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

/** Line churn upper bound per day. Re-exported so the scanner can clamp at
 * finalize — a single Write tool with 1e8+ newlines in its content would
 * otherwise throw at v.parse and crash the entire publish. */
export const MAX_LINES_PER_DAY = 100_000_000;

// ── Closed allowlists, single source of truth ───────────────
// Each tuple is the canonical list. Scanner imports it and builds its
// runtime Sets from the same constant. Schema `v.picklist`s are derived
// from `[...NAMED, ...buckets]` so drift between scanner and schema is
// impossible by construction.

/** Built-in Claude Code tool names. MCP tools are NOT named here — they're
 * collapsed to the `mcp` bucket by the scanner so installed-server names
 * don't leak. */
export const NAMED_TOOLS = [
  "Bash",
  "Read",
  "Edit",
  "Write",
  "MultiEdit",
  "Grep",
  "Glob",
  "NotebookRead",
  "NotebookEdit",
  "WebFetch",
  "WebSearch",
  "Task",
  "TodoWrite",
  "TodoRead",
  "ExitPlanMode",
  "Skill",
  "AskUserQuestion",
  "ScheduleWakeup",
  "ShareOnboardingGuide",
  "ToolSearch",
  "Monitor",
  "Agent",
] as const;
const TOOL_KEYS = [...NAMED_TOOLS, "mcp", "other"] as const;

/** Anthropic API stop_reason values. */
export const NAMED_STOP_REASONS = [
  "end_turn",
  "tool_use",
  "max_tokens",
  "stop_sequence",
  "pause_turn",
  "refusal",
] as const;
const STOP_REASON_KEYS = [...NAMED_STOP_REASONS, "none", "other"] as const;

/** Claude Code permission modes.
 *   - `default`, `acceptEdits`, `plan`, `bypassPermissions` are the
 *     documented modes from Claude Code's settings UI.
 *   - `auto` and `bubble` are real values observed in production JSONL
 *     (40k+ occurrences across this codebase's sample). Likely added in
 *     Claude Code 2.x; included so the scanner doesn't bucket the
 *     majority of toggles into "other". Remove if upstream confirms
 *     these are dev-only sentinels. */
export const NAMED_PERMISSION_MODES = [
  "default",
  "acceptEdits",
  "plan",
  "bypassPermissions",
  "auto",
  "bubble",
] as const;
const PERMISSION_MODE_KEYS = [...NAMED_PERMISSION_MODES, "other"] as const;

/** Claude Code hook event names. */
export const NAMED_HOOK_EVENTS = [
  "SessionStart",
  "UserPromptSubmit",
  "PreToolUse",
  "PostToolUse",
  "Stop",
  "SubagentStop",
  "Notification",
  "SessionEnd",
  "PreCompact",
] as const;
const HOOK_EVENT_KEYS = [...NAMED_HOOK_EVENTS, "other"] as const;

const ToolKeySchema = v.picklist(TOOL_KEYS);
const StopReasonKeySchema = v.picklist(STOP_REASON_KEYS);
const PermissionModeKeySchema = v.picklist(PERMISSION_MODE_KEYS);
const HookEventKeySchema = v.picklist(HOOK_EVENT_KEYS);

export type ToolKey = (typeof TOOL_KEYS)[number];
export type StopReasonKey = (typeof STOP_REASON_KEYS)[number];
export type PermissionModeKey = (typeof PERMISSION_MODE_KEYS)[number];
export type HookEventKey = (typeof HOOK_EVENT_KEYS)[number];

const ShareValueSchema = v.pipe(v.number(), v.minValue(0), v.maxValue(1));

const ModelBreakdownSchema = v.pipe(
  v.record(
    v.pipe(
      v.string(),
      v.regex(
        MODEL_KEY_REGEX,
        "model keys must match /^[a-z0-9._:/-]{1,64}$/i — prompt text and file paths cannot be used as keys"
      )
    ),
    ShareValueSchema
  ),
  v.check(
    (obj) => Object.keys(obj).length <= 32,
    "modelBreakdown supports at most 32 keys per day"
  )
);

const ToolUseBreakdownSchema = v.record(ToolKeySchema, ShareValueSchema);

const StopReasonBreakdownSchema = v.record(
  StopReasonKeySchema,
  ShareValueSchema
);

const PermissionModeBreakdownSchema = v.record(
  PermissionModeKeySchema,
  ShareValueSchema
);

const HourHistogramSchema = v.pipe(
  v.array(v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(1_000_000))),
  v.length(24, "hourHistogramLocal must have exactly 24 entries")
);

const CountSchema = v.pipe(
  v.number(),
  v.integer(),
  v.minValue(0),
  v.maxValue(10_000_000)
);

// Line churn can dwarf message counts on heavy days (huge generated files).
const LineCountSchema = v.pipe(
  v.number(),
  v.integer(),
  v.minValue(0),
  v.maxValue(MAX_LINES_PER_DAY)
);

// Minutes per day is bounded at 24h. Allow a small buffer for clock skew.
const MinutesPerDaySchema = v.pipe(
  v.number(),
  v.integer(),
  v.minValue(0),
  v.maxValue(1440)
);

// Latency clamped at 1h (3.6e6 ms) in the scanner; schema enforces.
const LatencyMsSchema = v.pipe(
  v.number(),
  v.integer(),
  v.minValue(0),
  v.maxValue(3_600_000)
);

// Distinct-thing counts: projects, branches, MCP servers. 1e4 is plenty.
const DistinctCountSchema = v.pipe(
  v.number(),
  v.integer(),
  v.minValue(0),
  v.maxValue(10_000)
);

const HookEventCountsSchema = v.record(HookEventKeySchema, CountSchema);

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
  assistantMessages: CountSchema,
  toolCalls: CountSchema,
  toolErrors: CountSchema,
  totalActiveMinutes: MinutesPerDaySchema,
  longestSessionMinutes: MinutesPerDaySchema,
  filesTouched: CountSchema,
  linesAdded: LineCountSchema,
  linesRemoved: LineCountSchema,
  hookErrors: CountSchema,
  responseLatencyMsP50: LatencyMsSchema,
  responseLatencyMsP95: LatencyMsSchema,
  projectsActive: DistinctCountSchema,
  gitBranchesActive: DistinctCountSchema,
  mcpServersUsed: DistinctCountSchema,
  sidechainMessages: CountSchema,
  modelBreakdown: ModelBreakdownSchema,
  toolUseBreakdown: ToolUseBreakdownSchema,
  stopReasonBreakdown: StopReasonBreakdownSchema,
  permissionModeBreakdown: PermissionModeBreakdownSchema,
  hookEventCounts: HookEventCountsSchema,
  hourHistogramLocal: HourHistogramSchema,
}); // strictObject rejects unknown per-day keys (leaked file paths, etc.)

export const UploadPayloadSchema = v.strictObject({
  schemaVersion: v.literal(3),
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
    schemaVersion: 3 as const,
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
      assistantMessages: d.assistantMessages,
      toolCalls: d.toolCalls,
      toolErrors: d.toolErrors,
      totalActiveMinutes: d.totalActiveMinutes,
      longestSessionMinutes: d.longestSessionMinutes,
      filesTouched: d.filesTouched,
      linesAdded: d.linesAdded,
      linesRemoved: d.linesRemoved,
      hookErrors: d.hookErrors,
      responseLatencyMsP50: d.responseLatencyMsP50,
      responseLatencyMsP95: d.responseLatencyMsP95,
      projectsActive: d.projectsActive,
      gitBranchesActive: d.gitBranchesActive,
      mcpServersUsed: d.mcpServersUsed,
      sidechainMessages: d.sidechainMessages,
      modelBreakdown: { ...d.modelBreakdown },
      toolUseBreakdown: { ...d.toolUseBreakdown },
      stopReasonBreakdown: { ...d.stopReasonBreakdown },
      permissionModeBreakdown: { ...d.permissionModeBreakdown },
      hookEventCounts: { ...d.hookEventCounts },
      hourHistogramLocal: d.hourHistogramLocal.slice(),
    })),
  };

  // Parse-validate before returning, so callers cannot leak. If the local
  // data violates the schema (e.g. a model name with a colon-prefix that
  // doesn't match), we throw at the source rather than upload garbage.
  return v.parse(UploadPayloadSchema, payload);
}
