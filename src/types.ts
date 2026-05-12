export type SourceType = "claude_code";

export type Scope = "weekly" | "monthly" | "all_time";

export type DailyAggregate = {
  source: SourceType;
  date: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  sessions: number;
  assistantMessages: number;
  toolCalls: number;
  toolErrors: number;
  totalActiveMinutes: number;
  longestSessionMinutes: number;
  filesTouched: number;
  linesAdded: number;
  linesRemoved: number;
  hookErrors: number;
  responseLatencyMsP50: number;
  responseLatencyMsP95: number;
  projectsActive: number;
  gitBranchesActive: number;
  mcpServersUsed: number;
  sidechainMessages: number;
  skillsUsed: number;
  subagentTypesUsed: number;
  worktreeEvents: number;
  fileHistorySnapshots: number;
  modelBreakdown: Record<string, number>;
  toolUseBreakdown: Record<string, number>;
  stopReasonBreakdown: Record<string, number>;
  permissionModeBreakdown: Record<string, number>;
  hookEventCounts: Record<string, number>;
  skillBreakdown: Record<string, number>;
  subagentTypeBreakdown: Record<string, number>;
  hourHistogramLocal: number[];
};

export type ScanSummary = {
  source: SourceType;
  daily: DailyAggregate[];
  firstDate: string | null;
  lastDate: string | null;
  totalDays: number;
  activeDays: number;
};
