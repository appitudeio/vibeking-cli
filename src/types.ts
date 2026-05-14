// ────────────────────────────────────────────────────────────
// Cross-tool wire format (v5). One day rolls up tokens + activity
// across whatever LLM-coding tools the user ran. Per-(tool, model)
// granularity lives in `shards[]`; day-level activity (lines, files,
// hours) stays at the day because it's tool-agnostic.
//
// CROSS-REPO CONTRACT: the wire shape mirrors the server's
// `UploadPayloadSchema` in vibeking/packages/core/src/redaction.ts.
// When changing one side, update both in the same cross-repo commit.
// ────────────────────────────────────────────────────────────

/**
 * Tools whose logs the CLI knows how to read. `claude-code` is the
 * only one with a real scanner today; the other four are declared
 * so the wire format + tool-registry framework can accept them
 * without a schema bump when their scanners ship.
 *
 * CROSS-REPO CONTRACT: byte-identical with `SUPPORTED_TOOLS` in the
 * server's redaction.ts.
 */
export const SUPPORTED_TOOLS = [
  "claude-code",
  "codex",
  "cline",
  "aider",
  "continue",
] as const;
export type Tool = (typeof SUPPORTED_TOOLS)[number];

export type Scope = "weekly" | "monthly" | "all_time";

/** Claude-Code-specific telemetry. Attached to the highest-token CC
 *  shard per day so the server's roll-up can sum extras across days
 *  without double-counting (other tools may add their own optional
 *  `<tool>Extras` block in future). */
export type ClaudeCodeExtras = {
  toolUseBreakdown: Record<string, number>;
  stopReasonBreakdown: Record<string, number>;
  permissionModeBreakdown: Record<string, number>;
  hookEventCounts: Record<string, number>;
  hookErrors: number;
  skillBreakdown: Record<string, number>;
  subagentTypeBreakdown: Record<string, number>;
  skillsUsed: number;
  subagentTypesUsed: number;
  mcpServersUsed: number;
  sidechainMessages: number;
};

/** One (tool, model) shard for a single user-day. Each shard carries
 *  its own token + activity counters; the server prices per shard via
 *  LiteLLM, so per-model granularity here is what protects multi-model
 *  users from being priced as if they used only one. */
export type DailyShard = {
  tool: Tool;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  sessions: number;
  assistantMessages: number;
  toolCalls: number;
  toolErrors: number;
  responseLatencyMsP50: number;
  responseLatencyMsP95: number;
  /** Only set on tool="claude-code" shards. Validated server-side via
   *  a zod discriminated union — non-CC shards carrying it are rejected. */
  claudeCodeExtras?: ClaudeCodeExtras;
};

/**
 * One day's aggregate. Rolled token counts at the day level are sums
 * across `shards[]` — kept for cheap CLI-side consumers (the reveal
 * banner, `topModel`) without forcing them to re-derive. The wire
 * format only ships `shards[]` plus day-level activity; rolled fields
 * are computed at the boundary, not transmitted.
 */
export type DailyAggregate = {
  date: string;
  // Day-level activity — tool-agnostic by definition.
  totalActiveMinutes: number;
  longestSessionMinutes: number;
  filesTouched: number;
  linesAdded: number;
  linesRemoved: number;
  projectsActive: number;
  gitBranchesActive: number;
  worktreeEvents: number;
  fileHistorySnapshots: number;
  hourHistogramLocal: number[];
  // Per-(tool, model) granularity. Wire format reads from here.
  shards: DailyShard[];
  // Rolled view for CLI consumers (reveal, topModel). NOT transmitted.
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  sessions: number;
};

export type ScanSummary = {
  daily: DailyAggregate[];
  firstDate: string | null;
  lastDate: string | null;
  totalDays: number;
  activeDays: number;
};
