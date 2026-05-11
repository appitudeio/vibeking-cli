import { describe, it, expect } from "vitest";
import {
  computeVibeBurn,
  computeVibeScore,
  computeStreakDays,
  buildScore,
  summarizeRange,
} from "../scoring.js";
import type { DailyAggregate } from "../types.js";

const M = 1_000_000;

const day = (overrides: Partial<DailyAggregate> & { date: string }): DailyAggregate => ({
  source: "claude_code",
  inputTokens: 0,
  outputTokens: 0,
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
  sessions: 1,
  modelBreakdown: {},
  ...overrides,
});

describe("computeVibeBurn", () => {
  it("discounts cache reads to 10% so they don't dominate", () => {
    expect(
      computeVibeBurn({
        inputTokens: 0,
        outputTokens: 0,
        cacheReadTokens: 100,
        cacheWriteTokens: 0,
      })
    ).toBe(10);
  });

  it("counts input + output + cacheWrite at full weight", () => {
    expect(
      computeVibeBurn({
        inputTokens: 100,
        outputTokens: 100,
        cacheReadTokens: 0,
        cacheWriteTokens: 100,
      })
    ).toBe(300);
  });
});

describe("computeVibeScore", () => {
  it("uses log-scaled burn so a 10x token user is not 10x score", () => {
    const small = computeVibeScore({
      scope: "weekly",
      totalInputTokens: 1 * M,
      totalOutputTokens: 0,
      totalCacheReadTokens: 0,
      totalCacheWriteTokens: 0,
      totalSessions: 1,
      activeDays: 1,
      streakDays: 1,
      peakDailyBurn: 1 * M,
      weekendBurnRatio: 0,
      uniqueTools: 1,
      uniqueModels: 1,
    });
    const big = computeVibeScore({
      scope: "weekly",
      totalInputTokens: 100 * M,
      totalOutputTokens: 0,
      totalCacheReadTokens: 0,
      totalCacheWriteTokens: 0,
      totalSessions: 1,
      activeDays: 1,
      streakDays: 1,
      peakDailyBurn: 100 * M,
      weekendBurnRatio: 0,
      uniqueTools: 1,
      uniqueModels: 1,
    });
    expect(big).toBeGreaterThan(small);
    expect(big / small).toBeLessThan(3); // not 100x — log-scaled
  });
});

describe("computeStreakDays", () => {
  it("returns 0 for empty data", () => {
    expect(computeStreakDays([])).toBe(0);
  });

  it("counts contiguous days ending today or yesterday", () => {
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const dates: string[] = [];
    for (let i = 0; i < 5; i++) {
      const d = new Date(today);
      d.setUTCDate(d.getUTCDate() - i);
      dates.push(d.toISOString().slice(0, 10));
    }
    const aggs = dates.map((date) => day({ date }));
    expect(computeStreakDays(aggs)).toBe(5);
  });

  it("breaks on gaps", () => {
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const yest = new Date(today);
    yest.setUTCDate(yest.getUTCDate() - 1);
    const fourDaysAgo = new Date(today);
    fourDaysAgo.setUTCDate(fourDaysAgo.getUTCDate() - 4);
    expect(
      computeStreakDays([
        day({ date: yest.toISOString().slice(0, 10) }),
        day({ date: fourDaysAgo.toISOString().slice(0, 10) }),
      ])
    ).toBe(1);
  });
});

describe("buildScore", () => {
  it("emits a deterministic title and level for a given input", () => {
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const aggs: DailyAggregate[] = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(today);
      d.setUTCDate(d.getUTCDate() - i);
      aggs.push(
        day({
          date: d.toISOString().slice(0, 10),
          inputTokens: 5 * M,
          outputTokens: 5 * M,
          cacheWriteTokens: 5 * M,
          sessions: 5,
          modelBreakdown: { "claude-opus-4-7": 1 },
        })
      );
    }
    const score = buildScore(aggs, "weekly");
    expect(score.vibeBurn).toBeGreaterThan(100 * M);
    expect(score.title).toBeTruthy();
    expect(score.level).toBeGreaterThanOrEqual(1);
  });
});

describe("summarizeRange", () => {
  it("filters by scope cutoff", () => {
    const aggs = [
      day({ date: "2020-01-01", inputTokens: 1 * M }),
      day({ date: new Date().toISOString().slice(0, 10), inputTokens: 5 * M }),
    ];
    const weekly = summarizeRange(aggs, "weekly");
    expect(weekly.totalInputTokens).toBe(5 * M);
    const allTime = summarizeRange(aggs, "all_time");
    expect(allTime.totalInputTokens).toBe(6 * M);
  });
});
