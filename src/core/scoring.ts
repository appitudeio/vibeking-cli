// The CLI scores locally only to preview "you have data worth publishing."
// Server is canonical for official VibeScore, rank, roast, and pricing.
// If you're adding billing / eligibility / official-roast logic — that goes
// server-side, not here. If you're renaming, consider Score → LocalPreview,
// vibeScore → previewScore, etc. (not done today).

import type { DailyAggregate, Score, ScoreInput } from "./types.js";
import { getTitle } from "./titles.js";

export const SCORING_VERSION = "v0.1";

export function computeVibeBurn(input: {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
}): number {
  return (
    input.inputTokens +
    input.outputTokens +
    input.cacheWriteTokens +
    Math.floor(input.cacheReadTokens * 0.1)
  );
}

/**
 * VibePoints formula. Story-forming axes only — every term should be
 * something someone can brag about or be roasted for. No "model mix"
 * energy here.
 */
export function computeVibeScore(input: ScoreInput): number {
  const burn = computeVibeBurn({
    inputTokens: input.totalInputTokens,
    outputTokens: input.totalOutputTokens,
    cacheReadTokens: input.totalCacheReadTokens,
    cacheWriteTokens: input.totalCacheWriteTokens,
  });

  // Burn — log-scaled so whales don't lock the board
  const burnPoints = Math.log10(burn + 1) * 1000;

  // Peak Day — your single most unhinged 24h. "I burned 800M in one day"
  // is a story; an average isn't.
  const peakPoints = Math.log10(input.peakDailyBurn + 1) * 200;

  // Streak — loss-aversion engine
  const streakBonus = input.streakDays * 75;

  // Active days — "I showed up"
  const consistencyBonus = input.activeDays * 100;

  // Weekend Warrior — identity-coded: "I have a job, I do this at night"
  const weekendBonus = input.weekendBurnRatio >= 0.4 ? 400 : 0;

  // Cache Goblin — cache_read ≥ 15× cache_write means you're not coding,
  // you're re-reading. Matches the existing badge threshold.
  const cacheWrites = Math.max(1, input.totalCacheWriteTokens);
  const cacheGoblinBonus =
    input.totalCacheReadTokens / cacheWrites >= 15 ? 500 : 0;

  return Math.round(
    burnPoints +
      peakPoints +
      streakBonus +
      consistencyBonus +
      weekendBonus +
      cacheGoblinBonus
  );
}

export function computeLevel(vibeScore: number): number {
  if (vibeScore <= 0) return 1;
  return Math.max(1, Math.floor(Math.log2(vibeScore / 50 + 1)) + 1);
}

export function computeStreakDays(daily: DailyAggregate[]): number {
  if (daily.length === 0) return 0;
  const sorted = [...daily].sort((a, b) => (a.date < b.date ? 1 : -1));
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  let streak = 0;
  let cursor = new Date(today);

  // Allow streak to start from yesterday if there's no record today yet
  const todayStr = isoDate(today);
  const firstEntry = sorted[0];
  if (!firstEntry || firstEntry.date !== todayStr) {
    cursor = new Date(today);
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }

  for (let i = 0; i < sorted.length + 1; i++) {
    const cursorStr = isoDate(cursor);
    const hit = sorted.find((d) => d.date === cursorStr);
    if (!hit) break;
    streak += 1;
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }

  return streak;
}

export function summarizeRange(
  daily: DailyAggregate[],
  scope: ScoreInput["scope"]
): ScoreInput {
  const cutoff = scopeCutoff(scope);
  const filtered = daily.filter((d) => d.date >= cutoff);

  let peakDailyBurn = 0;
  let weekendBurn = 0;
  let totalBurn = 0;

  const totals = filtered.reduce(
    (acc, d) => {
      acc.totalInputTokens += d.inputTokens;
      acc.totalOutputTokens += d.outputTokens;
      acc.totalCacheReadTokens += d.cacheReadTokens;
      acc.totalCacheWriteTokens += d.cacheWriteTokens;
      acc.totalSessions += d.sessions;
      acc.activeDays += 1;
      for (const m of Object.keys(d.modelBreakdown)) acc.modelSet.add(m);
      acc.toolSet.add(d.source);

      const dayBurn = computeVibeBurn({
        inputTokens: d.inputTokens,
        outputTokens: d.outputTokens,
        cacheReadTokens: d.cacheReadTokens,
        cacheWriteTokens: d.cacheWriteTokens,
      });
      totalBurn += dayBurn;
      if (dayBurn > peakDailyBurn) peakDailyBurn = dayBurn;

      // Treat the date as UTC. Sat=6, Sun=0. Day-level granularity only —
      // late-evening detection waits on an hourly scan in the CLI.
      const dow = new Date(`${d.date}T00:00:00Z`).getUTCDay();
      if (dow === 0 || dow === 6) weekendBurn += dayBurn;

      return acc;
    },
    {
      totalInputTokens: 0,
      totalOutputTokens: 0,
      totalCacheReadTokens: 0,
      totalCacheWriteTokens: 0,
      totalSessions: 0,
      activeDays: 0,
      modelSet: new Set<string>(),
      toolSet: new Set<string>(),
    }
  );

  const weekendBurnRatio = totalBurn > 0 ? weekendBurn / totalBurn : 0;

  return {
    scope,
    totalInputTokens: totals.totalInputTokens,
    totalOutputTokens: totals.totalOutputTokens,
    totalCacheReadTokens: totals.totalCacheReadTokens,
    totalCacheWriteTokens: totals.totalCacheWriteTokens,
    totalSessions: totals.totalSessions,
    activeDays: totals.activeDays,
    streakDays: computeStreakDays(filtered),
    peakDailyBurn,
    weekendBurnRatio,
    uniqueTools: totals.toolSet.size,
    uniqueModels: totals.modelSet.size,
  };
}

export function buildScore(daily: DailyAggregate[], scope: ScoreInput["scope"]): Score {
  return buildScoreWithSummary(daily, scope).score;
}

/**
 * Same as buildScore but also returns the underlying ScoreInput summary.
 * Callers that need streak/active/sessions counts (e.g. snapshot writes)
 * use this to avoid summarizing the same `daily` array twice.
 */
export function buildScoreWithSummary(
  daily: DailyAggregate[],
  scope: ScoreInput["scope"]
): { score: Score; summary: ScoreInput } {
  const summary = summarizeRange(daily, scope);
  const vibeBurn = computeVibeBurn({
    inputTokens: summary.totalInputTokens,
    outputTokens: summary.totalOutputTokens,
    cacheReadTokens: summary.totalCacheReadTokens,
    cacheWriteTokens: summary.totalCacheWriteTokens,
  });
  const vibeScore = computeVibeScore(summary);
  const level = computeLevel(vibeScore);
  const titleResult = getTitle({
    vibeBurn,
    vibeScore,
    streakDays: summary.streakDays,
    activeDays: summary.activeDays,
    uniqueModels: summary.uniqueModels,
    sessions: summary.totalSessions,
    cacheReadTokens: summary.totalCacheReadTokens,
    cacheWriteTokens: summary.totalCacheWriteTokens,
  });

  const score: Score = {
    scope,
    vibeBurn,
    vibeScore,
    level,
    title: titleResult.title,
    flair: titleResult.flair,
    badges: titleResult.badges,
    noLifeIndex: summary.weekendBurnRatio,
    scoringVersion: SCORING_VERSION,
  };
  return { score, summary };
}

/** Format a Date as YYYY-MM-DD in UTC. */
export function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Matches a YYYY-MM-DD string; doesn't validate the date itself. */
export const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

/** True when the input is a well-formed YYYY-MM-DD string. */
export function isIsoDate(s: string): boolean {
  return ISO_DATE_REGEX.test(s);
}

function scopeCutoff(scope: ScoreInput["scope"]): string {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  if (scope === "weekly") {
    today.setUTCDate(today.getUTCDate() - 6);
  } else if (scope === "monthly") {
    today.setUTCDate(today.getUTCDate() - 29);
  } else {
    return "0000-00-00";
  }
  return isoDate(today);
}
