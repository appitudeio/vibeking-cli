import * as v from "valibot";
import { KNOWN_MARKETPLACE_INVOCATIONS } from "./generated/marketplace-tokens.js";
import {
  SUPPORTED_TOOLS,
  type DailyAggregate,
  type Tool,
} from "./types.js";

// ────────────────────────────────────────────────────────────
// Skill / subagent_type classification (the trust gate)
//
// Both schemas validate user-emitted strings against an EXACT-MATCH set:
// either the full invocation string is in `KNOWN_MARKETPLACE_INVOCATIONS`
// (auto-synced from claudemarketplaces.com), or it's in the hand-curated
// supplement below, or it's the "other" bucket, or (for subagents) it's
// a built-in CC agent.
//
// We deliberately do NOT do prefix matching like `s.split(":")[0] in set`.
// A previous version of this file did, and recheck:deep found two
// CRITICAL privacy issues with that design:
//   1. Short marketplace tokens (`ai`, `cli`, `pdf`) collide with private
//      namespaces — `ai:omni-internal-strategy` would have shipped raw.
//   2. Namespace squatting — anyone publishing a public plugin named
//      `omni` would have globally relaxed every user's filter.
// Exact-match closes both classes by construction. The schema is enforced
// at runtime via `v.check` rather than `v.picklist` because the token set
// is too large (~2300 entries) for a literal-union TS type — but the
// runtime gate is identical.
// ────────────────────────────────────────────────────────────

/** Hand-curated supplement for popular public skills the auto-sync misses.
 * Keep this list short and justify each entry inline — anyone reading the
 * trust gate should be able to verify the GitHub repo exists and is
 * public.
 *
 * CROSS-REPO CONTRACT: this array MUST stay byte-identical with the same
 * constant in the private server repo at
 *   vibeking/packages/core/src/redaction.ts (`CURATED_PUBLIC_INVOCATIONS`).
 * If they diverge, the CLI may emit a payload its own redaction accepts
 * that the server's schema then rejects (or vice versa). When changing
 * either side, update both in the same PR / cross-repo commit. The same
 * applies to `BUILTIN_SUBAGENT_TYPES`, `MAX_LINES_PER_DAY`, all `NAMED_*`
 * allowlists, `MAX_TOKENS_PER_FIELD`, and `SUPPORTED_TOOLS`. */
const CURATED_PUBLIC_INVOCATIONS = [
  // db-query: popular DB query helper. Real public plugin; not yet
  // indexed at claudemarketplaces.com.
  "db-query",
  // SlidevJS plugins. Real public plugins; partial index coverage —
  // the namespaced forms aren't in the sitemap but appear in real data.
  "slidev-design",
  "slidev-visual-qa",
  // `obsidian`: the bare-name form. The sitemap indexes `obsidian-cli`,
  // `obsidian-markdown`, etc., but not the bare name we see in real data.
  "obsidian",
  // Marketplace SUBAGENT types. claudemarketplaces.com/sitemap.xml only
  // indexes `/skills/...` URLs; agents declared inside plugins (in their
  // marketplace.json `agents` array) don't surface in our auto-sync.
  // These are well-known public agents from the official Anthropic
  // marketplace (github.com/anthropics/claude-plugins-official); verified
  // by browsing each plugin's repo.
  "superpowers:code-reviewer",
  "code-review-ai:architect-review",
  "cloud-infrastructure:cloud-architect",
  "backend-development:backend-architect",
  "security-scanning:security-auditor",
  "unit-testing:test-automator",
];

/** Built-in Claude Code subagent types — shipped with CC itself, not a
 * marketplace. Hardcoded because they don't appear in any marketplace
 * registry. Keep in lock-step with code.claude.com/docs. */
const BUILTIN_SUBAGENT_TYPES = [
  "general-purpose",
  "Explore",
  "Plan",
  "claude-code-guide",
  "statusline-setup",
] as const;

const KNOWN_MARKETPLACE_INVOCATIONS_SET = new Set<string>([
  ...KNOWN_MARKETPLACE_INVOCATIONS,
  ...CURATED_PUBLIC_INVOCATIONS,
]);
const BUILTIN_SUBAGENT_TYPES_SET = new Set<string>(BUILTIN_SUBAGENT_TYPES);

/** A skill invocation is shippable iff it's the explicit "other" bucket OR
 * the exact string appears in the marketplace allowlist. No prefix
 * expansion (see header comment for the rationale). */
export function isShippableSkillName(s: string): boolean {
  if (s === "other") return true;
  return KNOWN_MARKETPLACE_INVOCATIONS_SET.has(s);
}

/** A subagent_type is shippable iff it's "other", a built-in CC agent, or
 * the exact string appears in the marketplace allowlist. */
export function isShippableSubagentType(s: string): boolean {
  if (s === "other") return true;
  if (BUILTIN_SUBAGENT_TYPES_SET.has(s)) return true;
  return KNOWN_MARKETPLACE_INVOCATIONS_SET.has(s);
}

/** Matches a YYYY-MM-DD string with valid month (01-12) and day (01-31).
 * Doesn't catch impossible dates like Feb 30 — `isIsoDate` round-trips
 * through `Date.parse` for that. */
export const ISO_DATE_REGEX =
  /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$/;

/** True when `s` is a real calendar date in YYYY-MM-DD form. Rejects both
 * structural garbage ("0000-00-00", "9999-99-99") and structurally-valid
 * but impossible dates (Feb 30, Apr 31) by round-tripping through Date. */
export function isIsoDate(s: string): boolean {
  if (!ISO_DATE_REGEX.test(s)) return false;
  const ms = Date.parse(`${s}T00:00:00Z`);
  if (!Number.isFinite(ms)) return false;
  return new Date(ms).toISOString().slice(0, 10) === s;
}

// ────────────────────────────────────────────────────────────
// UploadPayloadSchema (wire format v5) — single source of truth for what
// the CLI is allowed to send. Both the CLI (commands/inspectUpload +
// publish) and the server's scan route parse against this exact schema.
//
// v5 introduces per-(tool, model) shards inside each day. The CLI ships
// today only with a Claude Code scanner; the other tools in
// SUPPORTED_TOOLS are accepted by the wire format so their scanners can
// plug in without a schema bump when shipped.
//
// Any field added here must also be:
//   - rendered by `inspect-upload` (so users can verify before publish)
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

/** Claude Code permission modes. Real values observed in production JSONL;
 *  `auto` and `bubble` likely added in Claude Code 2.x. */
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

const ToolUseBreakdownSchema = v.record(ToolKeySchema, ShareValueSchema);
const StopReasonBreakdownSchema = v.record(StopReasonKeySchema, ShareValueSchema);
const PermissionModeBreakdownSchema = v.record(
  PermissionModeKeySchema,
  ShareValueSchema
);

const SkillBreakdownSchema = v.record(
  v.pipe(
    v.string(),
    v.check(
      isShippableSkillName,
      "skillBreakdown keys must be from a public marketplace (claudemarketplaces.com) or the 'other' bucket"
    )
  ),
  ShareValueSchema
);

const SubagentTypeBreakdownSchema = v.record(
  v.pipe(
    v.string(),
    v.check(
      isShippableSubagentType,
      "subagentTypeBreakdown keys must be a built-in CC agent, public-marketplace token, or 'other'"
    )
  ),
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

const LineCountSchema = v.pipe(
  v.number(),
  v.integer(),
  v.minValue(0),
  v.maxValue(MAX_LINES_PER_DAY)
);

const MinutesPerDaySchema = v.pipe(
  v.number(),
  v.integer(),
  v.minValue(0),
  v.maxValue(1440)
);

const LatencyMsSchema = v.pipe(
  v.number(),
  v.integer(),
  v.minValue(0),
  v.maxValue(3_600_000)
);

const DistinctCountSchema = v.pipe(
  v.number(),
  v.integer(),
  v.minValue(0),
  v.maxValue(10_000)
);

const HookEventCountsSchema = v.record(HookEventKeySchema, CountSchema);

// Claude-Code-specific telemetry. Lives inside a shard with tool="claude-code".
// Other tools may add their own optional `<tool>Extras` block in future.
const ClaudeCodeExtrasSchema = v.strictObject({
  toolUseBreakdown: ToolUseBreakdownSchema,
  stopReasonBreakdown: StopReasonBreakdownSchema,
  permissionModeBreakdown: PermissionModeBreakdownSchema,
  hookEventCounts: HookEventCountsSchema,
  hookErrors: CountSchema,
  skillBreakdown: SkillBreakdownSchema,
  subagentTypeBreakdown: SubagentTypeBreakdownSchema,
  skillsUsed: DistinctCountSchema,
  subagentTypesUsed: DistinctCountSchema,
  mcpServersUsed: DistinctCountSchema,
  sidechainMessages: CountSchema,
});

const SharedShardFields = {
  model: v.pipe(
    v.string(),
    v.regex(
      MODEL_KEY_REGEX,
      "model must match /^[a-z0-9._:/-]{1,64}$/i — prompt text and file paths cannot be used as keys"
    )
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
  sessions: v.pipe(
    v.number(),
    v.integer(),
    v.minValue(0),
    v.maxValue(1_000_000)
  ),
  assistantMessages: CountSchema,
  toolCalls: CountSchema,
  toolErrors: CountSchema,
  responseLatencyMsP50: LatencyMsSchema,
  responseLatencyMsP95: LatencyMsSchema,
};

const ClaudeCodeShardSchema = v.strictObject({
  tool: v.literal("claude-code"),
  ...SharedShardFields,
  claudeCodeExtras: v.optional(ClaudeCodeExtrasSchema),
});

// Non-CC tools never carry `claudeCodeExtras`. Once their scanners ship,
// each may grow its own optional `<tool>Extras` block.
const NonClaudeCodeShardSchema = v.strictObject({
  tool: v.picklist(SUPPORTED_TOOLS.filter((t) => t !== "claude-code")),
  ...SharedShardFields,
});

const DailyShardSchema = v.variant("tool", [
  ClaudeCodeShardSchema,
  NonClaudeCodeShardSchema,
]);

const DailyAggregateSchema = v.pipe(
  v.strictObject({
    date: v.pipe(
      v.string(),
      v.check(isIsoDate, "date must be a real YYYY-MM-DD calendar date")
    ),
    shards: v.pipe(
      v.array(DailyShardSchema),
      v.minLength(1, "at least one shard required per day"),
      v.maxLength(64, "no day realistically spans more than 64 (tool, model) pairs"),
      v.check(
        (arr) =>
          new Set(arr.map((s) => `${s.tool} ${s.model}`)).size === arr.length,
        "shards must be unique by (tool, model)"
      )
    ),
    totalActiveMinutes: MinutesPerDaySchema,
    longestSessionMinutes: MinutesPerDaySchema,
    filesTouched: CountSchema,
    linesAdded: LineCountSchema,
    linesRemoved: LineCountSchema,
    projectsActive: DistinctCountSchema,
    gitBranchesActive: DistinctCountSchema,
    worktreeEvents: CountSchema,
    fileHistorySnapshots: CountSchema,
    hourHistogramLocal: HourHistogramSchema,
  }),
  v.check(
    (day) => {
      // Cap rolled-day tokens at MAX_TOKENS_PER_FIELD. Per-shard cap alone
      // allows 64 shards × 1e13 = 6.4e14 per field, which overflows
      // Number.MAX_SAFE_INTEGER once aggregated across 366 days. Mirrors
      // the server's identical check.
      let i = 0, o = 0, cr = 0, cw = 0;
      for (const s of day.shards) {
        i += s.inputTokens;
        o += s.outputTokens;
        cr += s.cacheReadTokens;
        cw += s.cacheWriteTokens;
      }
      return (
        i <= MAX_TOKENS_PER_FIELD &&
        o <= MAX_TOKENS_PER_FIELD &&
        cr <= MAX_TOKENS_PER_FIELD &&
        cw <= MAX_TOKENS_PER_FIELD
      );
    },
    `rolled day tokens must not exceed ${MAX_TOKENS_PER_FIELD} per field`
  )
);

export const UploadPayloadSchema = v.pipe(
  v.strictObject({
    schemaVersion: v.literal(5),
    cliVersion: v.pipe(
      v.string(),
      v.regex(CLI_VERSION_REGEX, "cliVersion must be semver-ish")
    ),
    scannedAt: v.pipe(v.string(), v.isoTimestamp()),
    daily: v.pipe(
      v.array(DailyAggregateSchema),
      v.minLength(1, "payload must include at least one day"),
      v.maxLength(366),
      v.check(
        (arr) => new Set(arr.map((d) => d.date)).size === arr.length,
        "daily entries must have unique dates"
      )
    ),
  })
);

export type UploadPayload = v.InferOutput<typeof UploadPayloadSchema>;

/** Wire-format shard shape — exported for the snapshot tests and the
 *  inspect-upload command. */
export type WireDailyShard = v.InferOutput<typeof DailyShardSchema>;

/**
 * Build the upload payload from local aggregates. Turns the CLI's
 * internal `DailyAggregate` (which carries both rolled fields for CLI
 * consumers AND `shards[]` for the wire) into a strictly-validated
 * v5 envelope. Parse-validates before returning so callers cannot leak
 * — local data violating the schema throws at the source.
 */
export function buildUploadPayload(args: {
  cliVersion: string;
  daily: DailyAggregate[];
}): UploadPayload {
  const payload = {
    schemaVersion: 5 as const,
    cliVersion: args.cliVersion,
    scannedAt: new Date().toISOString(),
    daily: args.daily.map((d) => ({
      date: d.date,
      shards: d.shards.map((s) => cloneShard(s)),
      totalActiveMinutes: d.totalActiveMinutes,
      longestSessionMinutes: d.longestSessionMinutes,
      filesTouched: d.filesTouched,
      linesAdded: d.linesAdded,
      linesRemoved: d.linesRemoved,
      projectsActive: d.projectsActive,
      gitBranchesActive: d.gitBranchesActive,
      worktreeEvents: d.worktreeEvents,
      fileHistorySnapshots: d.fileHistorySnapshots,
      hourHistogramLocal: d.hourHistogramLocal.slice(),
    })),
  };
  return v.parse(UploadPayloadSchema, payload);
}

function cloneShard(s: DailyAggregate["shards"][number]): WireDailyShard {
  const base = {
    tool: s.tool,
    model: s.model,
    inputTokens: s.inputTokens,
    outputTokens: s.outputTokens,
    cacheReadTokens: s.cacheReadTokens,
    cacheWriteTokens: s.cacheWriteTokens,
    sessions: s.sessions,
    assistantMessages: s.assistantMessages,
    toolCalls: s.toolCalls,
    toolErrors: s.toolErrors,
    responseLatencyMsP50: s.responseLatencyMsP50,
    responseLatencyMsP95: s.responseLatencyMsP95,
  };
  if (s.tool === "claude-code" && s.claudeCodeExtras) {
    return {
      ...base,
      tool: "claude-code",
      claudeCodeExtras: {
        toolUseBreakdown: { ...s.claudeCodeExtras.toolUseBreakdown },
        stopReasonBreakdown: { ...s.claudeCodeExtras.stopReasonBreakdown },
        permissionModeBreakdown: {
          ...s.claudeCodeExtras.permissionModeBreakdown,
        },
        hookEventCounts: { ...s.claudeCodeExtras.hookEventCounts },
        hookErrors: s.claudeCodeExtras.hookErrors,
        skillBreakdown: { ...s.claudeCodeExtras.skillBreakdown },
        subagentTypeBreakdown: {
          ...s.claudeCodeExtras.subagentTypeBreakdown,
        },
        skillsUsed: s.claudeCodeExtras.skillsUsed,
        subagentTypesUsed: s.claudeCodeExtras.subagentTypesUsed,
        mcpServersUsed: s.claudeCodeExtras.mcpServersUsed,
        sidechainMessages: s.claudeCodeExtras.sidechainMessages,
      },
    };
  }
  // Non-CC tool (or CC with no extras) — narrow to the no-extras variant.
  // Casting via the discriminant is the simplest way to satisfy the
  // discriminated union without restructuring `base`.
  return { ...base, tool: s.tool as Exclude<Tool, "claude-code"> };
}
