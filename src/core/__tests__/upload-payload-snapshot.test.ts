import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { scanClaudeCodeDir } from "../../scanner.js";
import { buildUploadPayload } from "../redaction.js";

// Trust anchor: scanner + buildUploadPayload must produce a byte-stable
// payload for known fixture data. If a refactor changes the wire format,
// this test fails loudly — independent of whatever is in ~/.claude/projects
// on the dev machine.

const FIXTURE_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../../test/fixtures/claude-projects"
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
      schemaVersion: 1,
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
          modelBreakdown: {
            "claude-opus-4-7": 0.5,
            "claude-sonnet-4-6": 0.25,
            synthetic: 0.25,
          },
        },
        {
          date: "2026-01-16",
          inputTokens: 440,
          outputTokens: 880,
          cacheReadTokens: 220,
          cacheWriteTokens: 112,
          sessions: 2,
          modelBreakdown: {
            "claude-opus-4-7": 0.3333,
            "claude-sonnet-4-6": 0.6667,
          },
        },
      ],
    });
  });
});
