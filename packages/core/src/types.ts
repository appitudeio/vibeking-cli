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

export type ScoreInput = {
  scope: "weekly" | "monthly" | "all_time";
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCacheReadTokens: number;
  totalCacheWriteTokens: number;
  totalSessions: number;
  activeDays: number;
  streakDays: number;
  /** Largest single-day vibeBurn within scope — drives the Peak Day bonus. */
  peakDailyBurn: number;
  /** 0..1, fraction of scope burn that fell on Saturday/Sunday. */
  weekendBurnRatio: number;
  // Kept for title + badge logic, not used in the score formula.
  uniqueTools: number;
  uniqueModels: number;
};

export type Score = {
  scope: ScoreInput["scope"];
  vibeBurn: number;
  vibeScore: number;
  level: number;
  title: string;
  flair: string;
  badges: string[];
  /**
   * 0–1 ratio: what fraction of scope burn happened on weekends.
   * Future: blend with late-night-burn fraction once hourly scanning lands.
   * Stored persistently so the leaderboard can flex it without a join.
   */
  noLifeIndex: number;
  /**
   * API-equivalent USD — what the burn would have cost on the Anthropic
   * API at list prices. Pro/Max subscribers don't actually pay this;
   * that's the joke.
   */
  costUsd: number;
  /**
   * Version tag of the formula that produced this score. Bump when
   * weights or axes change — old snapshots keep their tag so we can
   * explain rank shifts as "balance patches" instead of silent moves.
   */
  scoringVersion: string;
};
