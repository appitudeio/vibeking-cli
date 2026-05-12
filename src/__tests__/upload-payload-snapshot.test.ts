import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { scanClaudeCodeDir } from "../scanner.js";
import { buildUploadPayload } from "../redaction.js";

// Trust anchor: scanner + buildUploadPayload must produce a byte-stable
// payload for known fixture data. If a refactor changes the wire format,
// this test fails loudly — independent of whatever is in ~/.claude/projects
// on the dev machine.
//
// The package.json test script forces TZ=UTC so the local-hour histogram
// is deterministic regardless of where the test runs.

const FIXTURE_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../test/fixtures/claude-projects"
);

const FROZEN_NOW = new Date("2026-01-20T12:00:00.000Z");

describe("upload payload snapshot (fixture → wire format)", () => {
  beforeAll(() => {
    vi.useFakeTimers();
    vi.setSystemTime(FROZEN_NOW);
  });

  afterAll(() => {
    vi.useRealTimers();
  });

  it("produces the exact expected payload from the synthetic fixture", async () => {
    const summary = await scanClaudeCodeDir(FIXTURE_DIR);
    const payload = buildUploadPayload({
      source: "claude_code",
      cliVersion: "0.0.0-test",
      daily: summary.daily,
    });

    expect(payload).toEqual({
      schemaVersion: 3,
      source: "claude_code",
      cliVersion: "0.0.0-test",
      scannedAt: "2026-01-20T12:00:00.000Z",
      daily: [
        {
          date: "2026-01-15",
          inputTokens: 310,
          outputTokens: 620,
          cacheReadTokens: 155,
          cacheWriteTokens: 77,
          sessions: 2,
          assistantMessages: 4,
          toolCalls: 5,
          toolErrors: 1,
          totalActiveMinutes: 7,
          longestSessionMinutes: 5,
          filesTouched: 3,
          linesAdded: 3,
          linesRemoved: 0,
          hookErrors: 1,
          responseLatencyMsP50: 30000,
          responseLatencyMsP95: 90000,
          projectsActive: 2,
          gitBranchesActive: 2,
          mcpServersUsed: 0,
          sidechainMessages: 1,
          modelBreakdown: {
            "claude-opus-4-7": 0.5,
            "claude-sonnet-4-6": 0.25,
            synthetic: 0.25,
          },
          toolUseBreakdown: {
            Bash: 0.2,
            Read: 0.4,
            Grep: 0.2,
            Write: 0.2,
          },
          stopReasonBreakdown: {
            end_turn: 0.5,
            tool_use: 0.5,
          },
          permissionModeBreakdown: {
            plan: 1,
          },
          hookEventCounts: {
            PreToolUse: 1,
            PostToolUse: 1,
          },
          hourHistogramLocal: [
            0, 0, 0, 0, 0, 0, 0, 0, 0, 2, 0, 0, 0, 0, 2, 0, 0, 0, 0, 0, 0, 0,
            0, 0,
          ],
        },
        {
          date: "2026-01-16",
          inputTokens: 440,
          outputTokens: 880,
          cacheReadTokens: 220,
          cacheWriteTokens: 112,
          sessions: 2,
          assistantMessages: 3,
          toolCalls: 3,
          toolErrors: 0,
          totalActiveMinutes: 30,
          longestSessionMinutes: 30,
          filesTouched: 1,
          linesAdded: 0,
          linesRemoved: 2,
          hookErrors: 0,
          responseLatencyMsP50: 30000,
          responseLatencyMsP95: 30000,
          projectsActive: 1,
          gitBranchesActive: 1,
          mcpServersUsed: 1,
          sidechainMessages: 0,
          modelBreakdown: {
            "claude-opus-4-7": 0.3333,
            "claude-sonnet-4-6": 0.6667,
          },
          toolUseBreakdown: {
            Edit: 0.3333,
            Bash: 0.3333,
            mcp: 0.3333,
          },
          stopReasonBreakdown: {
            tool_use: 0.3333,
            max_tokens: 0.3333,
            end_turn: 0.3333,
          },
          permissionModeBreakdown: {
            acceptEdits: 1,
          },
          hookEventCounts: {
            SessionStart: 1,
          },
          hourHistogramLocal: [
            0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0,
            0, 0,
          ],
        },
      ],
    });
  });
});
