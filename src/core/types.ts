export type SourceType = "claude_code";

export type DailyAggregate = {
  source: SourceType;
  date: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  sessions: number;
  modelBreakdown: Record<string, number>;
};

export type ScanSummary = {
  source: SourceType;
  daily: DailyAggregate[];
  firstDate: string | null;
  lastDate: string | null;
  totalDays: number;
  activeDays: number;
};
