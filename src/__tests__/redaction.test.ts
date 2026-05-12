import { describe, it, expect } from "vitest";
import * as v from "valibot";
import {
  buildUploadPayload,
  UploadPayloadSchema,
  type UploadPayload,
} from "../redaction.js";
import type { DailyAggregate } from "../types.js";

const emptyHistogram = new Array<number>(24).fill(0);

type CCShard = Extract<
  UploadPayload["daily"][number]["shards"][number],
  { tool: "claude-code" }
>;

const ccShard: CCShard = {
  tool: "claude-code",
  model: "claude-opus-4-7",
  inputTokens: 100,
  outputTokens: 200,
  cacheReadTokens: 50,
  cacheWriteTokens: 25,
  sessions: 3,
  assistantMessages: 12,
  toolCalls: 4,
  toolErrors: 1,
  responseLatencyMsP50: 8000,
  responseLatencyMsP95: 42000,
  claudeCodeExtras: {
    toolUseBreakdown: { Bash: 0.5, Read: 0.5 },
    stopReasonBreakdown: { end_turn: 0.5, tool_use: 0.5 },
    permissionModeBreakdown: { default: 0.7, plan: 0.3 },
    hookEventCounts: { SessionStart: 2, PreToolUse: 5, PostToolUse: 5 },
    hookErrors: 0,
    skillBreakdown: { "db-query": 0.6, other: 0.4 },
    subagentTypeBreakdown: { "general-purpose": 0.8, other: 0.2 },
    skillsUsed: 3,
    subagentTypesUsed: 2,
    mcpServersUsed: 1,
    sidechainMessages: 2,
  },
};

const validInput: UploadPayload = {
  schemaVersion: 5,
  cliVersion: "0.0.2",
  scannedAt: "2026-05-10T12:00:00.000Z",
  daily: [
    {
      date: "2026-05-10",
      shards: [ccShard],
      totalActiveMinutes: 90,
      longestSessionMinutes: 45,
      filesTouched: 8,
      linesAdded: 120,
      linesRemoved: 40,
      projectsActive: 2,
      gitBranchesActive: 3,
      worktreeEvents: 5,
      fileHistorySnapshots: 12,
      hourHistogramLocal: emptyHistogram,
    },
  ],
};

/** Build a local DailyAggregate (the CLI's internal shape) — used to drive
 *  `buildUploadPayload`. Mirrors the validInput wire shape but carries the
 *  rolled-token fields the CLI's own consumers read. */
function makeLocalDay(): DailyAggregate {
  return {
    date: "2026-05-10",
    inputTokens: 100,
    outputTokens: 200,
    cacheReadTokens: 50,
    cacheWriteTokens: 25,
    sessions: 3,
    totalActiveMinutes: 90,
    longestSessionMinutes: 45,
    filesTouched: 8,
    linesAdded: 120,
    linesRemoved: 40,
    projectsActive: 2,
    gitBranchesActive: 3,
    worktreeEvents: 5,
    fileHistorySnapshots: 12,
    hourHistogramLocal: emptyHistogram,
    shards: [
      {
        tool: "claude-code",
        model: "claude-opus-4-7",
        inputTokens: 100,
        outputTokens: 200,
        cacheReadTokens: 50,
        cacheWriteTokens: 25,
        sessions: 3,
        assistantMessages: 12,
        toolCalls: 4,
        toolErrors: 1,
        responseLatencyMsP50: 8000,
        responseLatencyMsP95: 42000,
        claudeCodeExtras: {
          toolUseBreakdown: { Bash: 0.5, Read: 0.5 },
          stopReasonBreakdown: { end_turn: 0.5, tool_use: 0.5 },
          permissionModeBreakdown: { default: 1 },
          hookEventCounts: { SessionStart: 1 },
          hookErrors: 0,
          skillBreakdown: { "db-query": 1 },
          subagentTypeBreakdown: { "general-purpose": 1 },
          skillsUsed: 3,
          subagentTypesUsed: 2,
          mcpServersUsed: 1,
          sidechainMessages: 2,
        },
      },
    ],
  };
}

describe("buildUploadPayload", () => {
  it("only includes allowlisted top-level + per-day keys", () => {
    const payload = buildUploadPayload({
      cliVersion: "0.0.2",
      daily: [makeLocalDay()],
    });

    expect(Object.keys(payload).sort()).toEqual([
      "cliVersion",
      "daily",
      "scannedAt",
      "schemaVersion",
    ]);
    expect(Object.keys(payload.daily[0]!).sort()).toEqual([
      "date",
      "fileHistorySnapshots",
      "filesTouched",
      "gitBranchesActive",
      "hourHistogramLocal",
      "linesAdded",
      "linesRemoved",
      "longestSessionMinutes",
      "projectsActive",
      "shards",
      "totalActiveMinutes",
      "worktreeEvents",
    ]);
    expect(Object.keys(payload.daily[0]!.shards[0]!).sort()).toEqual([
      "assistantMessages",
      "cacheReadTokens",
      "cacheWriteTokens",
      "claudeCodeExtras",
      "inputTokens",
      "model",
      "outputTokens",
      "responseLatencyMsP50",
      "responseLatencyMsP95",
      "sessions",
      "tool",
      "toolCalls",
      "toolErrors",
    ]);
  });

  it("emits schemaVersion 5", () => {
    const payload = buildUploadPayload({
      cliVersion: "0.0.2",
      daily: [makeLocalDay()],
    });
    expect(payload.schemaVersion).toBe(5);
  });
});

describe("UploadPayloadSchema", () => {
  it("passes a clean payload", () => {
    expect(v.safeParse(UploadPayloadSchema, validInput).success).toBe(true);
  });

  it("rejects unexpected top-level keys (e.g., a leaked prompt field)", () => {
    const res = v.safeParse(UploadPayloadSchema, {
      ...validInput,
      prompt: "leaked!",
    });
    expect(res.success).toBe(false);
  });

  it("rejects unexpected per-day keys (e.g., a leaked file path)", () => {
    const res = v.safeParse(UploadPayloadSchema, {
      ...validInput,
      daily: [{ ...validInput.daily[0]!, filePath: "/secrets/x.ts" }],
    });
    expect(res.success).toBe(false);
  });

  it("rejects unexpected per-shard keys", () => {
    const res = v.safeParse(UploadPayloadSchema, {
      ...validInput,
      daily: [
        {
          ...validInput.daily[0]!,
          shards: [{ ...ccShard, raw_prompt: "hi" }],
        },
      ],
    });
    expect(res.success).toBe(false);
  });

  it("rejects bad date format", () => {
    const res = v.safeParse(UploadPayloadSchema, {
      ...validInput,
      daily: [{ ...validInput.daily[0]!, date: "yesterday" }],
    });
    expect(res.success).toBe(false);
  });

  it("rejects negative tokens on a shard", () => {
    const res = v.safeParse(UploadPayloadSchema, {
      ...validInput,
      daily: [
        {
          ...validInput.daily[0]!,
          shards: [{ ...ccShard, inputTokens: -1 }],
        },
      ],
    });
    expect(res.success).toBe(false);
  });

  it("rejects model keys containing prompt-like text or file paths", () => {
    const leakedPrompt = v.safeParse(UploadPayloadSchema, {
      ...validInput,
      daily: [
        {
          ...validInput.daily[0]!,
          shards: [
            {
              ...ccShard,
              model: "USER PROMPT: my AWS key is AKIA…",
            },
          ],
        },
      ],
    });
    expect(leakedPrompt.success).toBe(false);

    const leakedPath = v.safeParse(UploadPayloadSchema, {
      ...validInput,
      daily: [
        {
          ...validInput.daily[0]!,
          shards: [
            {
              ...ccShard,
              model: "/Users/victim/Code/secret-repo/api.ts",
            },
          ],
        },
      ],
    });
    expect(leakedPath.success).toBe(false);
  });

  it("rejects duplicate (tool, model) shards in the same day", () => {
    const res = v.safeParse(UploadPayloadSchema, {
      ...validInput,
      daily: [
        {
          ...validInput.daily[0]!,
          shards: [
            ccShard,
            ccShard,
          ],
        },
      ],
    });
    expect(res.success).toBe(false);
  });

  it("caps shards at 64 per day", () => {
    const tooMany = Array.from({ length: 65 }, (_, i) => ({
      tool: "codex" as const,
      model: `gpt-${i}`,
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      sessions: 0,
      assistantMessages: 0,
      toolCalls: 0,
      toolErrors: 0,
      responseLatencyMsP50: 0,
      responseLatencyMsP95: 0,
    }));
    const res = v.safeParse(UploadPayloadSchema, {
      ...validInput,
      daily: [{ ...validInput.daily[0]!, shards: tooMany }],
    });
    expect(res.success).toBe(false);
  });

  it("caps tokens at 1e13 per shard field", () => {
    const res = v.safeParse(UploadPayloadSchema, {
      ...validInput,
      daily: [
        {
          ...validInput.daily[0]!,
          shards: [{ ...ccShard, inputTokens: 1e14 }],
        },
      ],
    });
    expect(res.success).toBe(false);
  });

  it("rejects non-semver cliVersion (potential leak vector)", () => {
    const res = v.safeParse(UploadPayloadSchema, {
      ...validInput,
      cliVersion: "totally not a version — actually a leaked prompt",
    });
    expect(res.success).toBe(false);
  });

  it("rejects unknown tool names in claudeCodeExtras.toolUseBreakdown", () => {
    const res = v.safeParse(UploadPayloadSchema, {
      ...validInput,
      daily: [
        {
          ...validInput.daily[0]!,
          shards: [
            {
              ...ccShard,
              claudeCodeExtras: {
                ...ccShard.claudeCodeExtras!,
                toolUseBreakdown: { LeakedToolName: 1 },
              },
            },
          ],
        },
      ],
    });
    expect(res.success).toBe(false);
  });

  it("rejects raw mcp__ tool names (must collapse to 'mcp')", () => {
    const res = v.safeParse(UploadPayloadSchema, {
      ...validInput,
      daily: [
        {
          ...validInput.daily[0]!,
          shards: [
            {
              ...ccShard,
              claudeCodeExtras: {
                ...ccShard.claudeCodeExtras!,
                toolUseBreakdown: { "mcp__claude_ai_Notion__search": 1 },
              },
            },
          ],
        },
      ],
    });
    expect(res.success).toBe(false);
  });

  it("accepts 'mcp' and 'other' bucket keys in toolUseBreakdown", () => {
    const res = v.safeParse(UploadPayloadSchema, {
      ...validInput,
      daily: [
        {
          ...validInput.daily[0]!,
          shards: [
            {
              ...ccShard,
              claudeCodeExtras: {
                ...ccShard.claudeCodeExtras!,
                toolUseBreakdown: { Bash: 0.5, mcp: 0.3, other: 0.2 },
              },
            },
          ],
        },
      ],
    });
    expect(res.success).toBe(true);
  });

  it("rejects unknown stop_reason values", () => {
    const res = v.safeParse(UploadPayloadSchema, {
      ...validInput,
      daily: [
        {
          ...validInput.daily[0]!,
          shards: [
            {
              ...ccShard,
              claudeCodeExtras: {
                ...ccShard.claudeCodeExtras!,
                stopReasonBreakdown: { not_a_real_reason: 1 },
              },
            },
          ],
        },
      ],
    });
    expect(res.success).toBe(false);
  });

  it("rejects hourHistogramLocal of wrong length", () => {
    const tooShort = v.safeParse(UploadPayloadSchema, {
      ...validInput,
      daily: [
        {
          ...validInput.daily[0]!,
          hourHistogramLocal: new Array<number>(23).fill(0),
        },
      ],
    });
    expect(tooShort.success).toBe(false);

    const tooLong = v.safeParse(UploadPayloadSchema, {
      ...validInput,
      daily: [
        {
          ...validInput.daily[0]!,
          hourHistogramLocal: new Array<number>(25).fill(0),
        },
      ],
    });
    expect(tooLong.success).toBe(false);
  });

  it("rejects non-integer values in hourHistogramLocal", () => {
    const histogram = new Array<number>(24).fill(0);
    histogram[12] = 1.5;
    const res = v.safeParse(UploadPayloadSchema, {
      ...validInput,
      daily: [{ ...validInput.daily[0]!, hourHistogramLocal: histogram }],
    });
    expect(res.success).toBe(false);
  });

  it("rejects negative counts on the shard (assistantMessages/toolCalls/toolErrors)", () => {
    for (const field of [
      "assistantMessages",
      "toolCalls",
      "toolErrors",
    ] as const) {
      const res = v.safeParse(UploadPayloadSchema, {
        ...validInput,
        daily: [
          {
            ...validInput.daily[0]!,
            shards: [{ ...ccShard, [field]: -1 }],
          },
        ],
      });
      expect(res.success, `expected -1 ${field} to be rejected`).toBe(false);
    }
  });

  it("rejects schemaVersion < 5 (previous wire formats)", () => {
    for (const v of [1, 2, 3, 4]) {
      const res = (vSafeParse(v, validInput) as unknown) as { success: boolean };
      expect(res.success, `expected schemaVersion ${v} to be rejected`).toBe(false);
    }
  });

  it("rejects unknown permission modes", () => {
    const res = v.safeParse(UploadPayloadSchema, {
      ...validInput,
      daily: [
        {
          ...validInput.daily[0]!,
          shards: [
            {
              ...ccShard,
              claudeCodeExtras: {
                ...ccShard.claudeCodeExtras!,
                permissionModeBreakdown: { sudo: 1 },
              },
            },
          ],
        },
      ],
    });
    expect(res.success).toBe(false);
  });

  it("accepts known permission modes", () => {
    const res = v.safeParse(UploadPayloadSchema, {
      ...validInput,
      daily: [
        {
          ...validInput.daily[0]!,
          shards: [
            {
              ...ccShard,
              claudeCodeExtras: {
                ...ccShard.claudeCodeExtras!,
                permissionModeBreakdown: {
                  default: 0.4,
                  acceptEdits: 0.3,
                  plan: 0.2,
                  bypassPermissions: 0.1,
                },
              },
            },
          ],
        },
      ],
    });
    expect(res.success).toBe(true);
  });

  it("rejects unknown hook event names", () => {
    const res = v.safeParse(UploadPayloadSchema, {
      ...validInput,
      daily: [
        {
          ...validInput.daily[0]!,
          shards: [
            {
              ...ccShard,
              claudeCodeExtras: {
                ...ccShard.claudeCodeExtras!,
                hookEventCounts: { PostDeployHook: 1 },
              },
            },
          ],
        },
      ],
    });
    expect(res.success).toBe(false);
  });

  it("rejects per-day minutes over 1440 (24h cap)", () => {
    const overTotal = v.safeParse(UploadPayloadSchema, {
      ...validInput,
      daily: [{ ...validInput.daily[0]!, totalActiveMinutes: 1441 }],
    });
    expect(overTotal.success).toBe(false);

    const overLongest = v.safeParse(UploadPayloadSchema, {
      ...validInput,
      daily: [{ ...validInput.daily[0]!, longestSessionMinutes: 1441 }],
    });
    expect(overLongest.success).toBe(false);
  });

  it("rejects latency over 1h cap on a shard", () => {
    const res = v.safeParse(UploadPayloadSchema, {
      ...validInput,
      daily: [
        {
          ...validInput.daily[0]!,
          shards: [
            {
              ...ccShard,
              responseLatencyMsP50: 3_600_001,
            },
          ],
        },
      ],
    });
    expect(res.success).toBe(false);
  });

  it("rejects user-specific skill names (must be allowlisted or 'other')", () => {
    const res = v.safeParse(UploadPayloadSchema, {
      ...validInput,
      daily: [
        {
          ...validInput.daily[0]!,
          shards: [
            {
              ...ccShard,
              claudeCodeExtras: {
                ...ccShard.claudeCodeExtras!,
                skillBreakdown: { "brain:plan-update": 1 },
              },
            },
          ],
        },
      ],
    });
    expect(res.success).toBe(false);
  });

  it("accepts allowlisted public-marketplace skill names + 'other'", () => {
    const res = v.safeParse(UploadPayloadSchema, {
      ...validInput,
      daily: [
        {
          ...validInput.daily[0]!,
          shards: [
            {
              ...ccShard,
              claudeCodeExtras: {
                ...ccShard.claudeCodeExtras!,
                skillBreakdown: {
                  "db-query": 0.4,
                  "superpowers:brainstorming": 0.3,
                  "frontend-design:frontend-design": 0.2,
                  other: 0.1,
                },
              },
            },
          ],
        },
      ],
    });
    expect(res.success).toBe(true);
  });

  it("rejects user-specific subagent_type names", () => {
    const res = v.safeParse(UploadPayloadSchema, {
      ...validInput,
      daily: [
        {
          ...validInput.daily[0]!,
          shards: [
            {
              ...ccShard,
              claudeCodeExtras: {
                ...ccShard.claudeCodeExtras!,
                subagentTypeBreakdown: { "gsd-executor": 1 },
              },
            },
          ],
        },
      ],
    });
    expect(res.success).toBe(false);
  });

  it("accepts built-in + allowlisted subagent_type names + 'other'", () => {
    const res = v.safeParse(UploadPayloadSchema, {
      ...validInput,
      daily: [
        {
          ...validInput.daily[0]!,
          shards: [
            {
              ...ccShard,
              claudeCodeExtras: {
                ...ccShard.claudeCodeExtras!,
                subagentTypeBreakdown: {
                  "general-purpose": 0.5,
                  Explore: 0.2,
                  Plan: 0.1,
                  "superpowers:code-reviewer": 0.1,
                  other: 0.1,
                },
              },
            },
          ],
        },
      ],
    });
    expect(res.success).toBe(true);
  });

  it("rejects negative day-level counts", () => {
    for (const field of [
      "filesTouched",
      "linesAdded",
      "linesRemoved",
      "projectsActive",
      "gitBranchesActive",
      "worktreeEvents",
      "fileHistorySnapshots",
      "totalActiveMinutes",
      "longestSessionMinutes",
    ] as const) {
      const res = v.safeParse(UploadPayloadSchema, {
        ...validInput,
        daily: [{ ...validInput.daily[0]!, [field]: -1 }],
      });
      expect(res.success, `expected -1 ${field} to be rejected`).toBe(false);
    }
  });

  it("rejects claudeCodeExtras on a non-claude-code shard", () => {
    const res = v.safeParse(UploadPayloadSchema, {
      ...validInput,
      daily: [
        {
          ...validInput.daily[0]!,
          shards: [
            {
              tool: "codex",
              model: "gpt-5",
              inputTokens: 0,
              outputTokens: 0,
              cacheReadTokens: 0,
              cacheWriteTokens: 0,
              sessions: 0,
              assistantMessages: 0,
              toolCalls: 0,
              toolErrors: 0,
              responseLatencyMsP50: 0,
              responseLatencyMsP95: 0,
              // strictObject rejects this; it's not part of the codex variant.
              claudeCodeExtras:
                ccShard.claudeCodeExtras!,
            },
          ],
        },
      ],
    });
    expect(res.success).toBe(false);
  });

  it("accepts the non-claude-code tool variants without extras", () => {
    for (const tool of ["codex", "cline", "aider", "continue"] as const) {
      const res = v.safeParse(UploadPayloadSchema, {
        ...validInput,
        daily: [
          {
            ...validInput.daily[0]!,
            shards: [
              {
                tool,
                model: "some-model",
                inputTokens: 0,
                outputTokens: 0,
                cacheReadTokens: 0,
                cacheWriteTokens: 0,
                sessions: 0,
                assistantMessages: 0,
                toolCalls: 0,
                toolErrors: 0,
                responseLatencyMsP50: 0,
                responseLatencyMsP95: 0,
              },
            ],
          },
        ],
      });
      expect(res.success, `expected ${tool} to pass`).toBe(true);
    }
  });

  it("rejects unsupported tool values", () => {
    const res = v.safeParse(UploadPayloadSchema, {
      ...validInput,
      daily: [
        {
          ...validInput.daily[0]!,
          shards: [
            {
              ...ccShard,
              tool: "made-up-tool",
            },
          ],
        },
      ],
    });
    expect(res.success).toBe(false);
  });
});

/** Helper for the v < 5 schemaVersion rejection test — wraps safeParse so the
 *  loop body stays compact. */
function vSafeParse(schemaVersion: number, validInput: UploadPayload) {
  return v.safeParse(UploadPayloadSchema, {
    ...validInput,
    schemaVersion: schemaVersion as unknown as 5,
  });
}

describe("isIsoDate", () => {
  it("rejects regex-passing but impossible dates", () => {
    const okShape = {
      ...validInput.daily[0]!,
      // Feb 30 normalizes to Mar 02 via Date(), so round-trip rejects.
      date: "2026-02-30",
    };
    const res = v.safeParse(UploadPayloadSchema, {
      ...validInput,
      daily: [okShape],
    });
    expect(res.success).toBe(false);
  });

  it("rejects 0000-00-00 phantom dates", () => {
    const res = v.safeParse(UploadPayloadSchema, {
      ...validInput,
      daily: [{ ...validInput.daily[0]!, date: "0000-00-00" }],
    });
    expect(res.success).toBe(false);
  });

  it("rejects out-of-range months and days", () => {
    for (const bad of ["2026-13-01", "2026-00-15", "2026-05-00", "2026-05-32"]) {
      const res = v.safeParse(UploadPayloadSchema, {
        ...validInput,
        daily: [{ ...validInput.daily[0]!, date: bad }],
      });
      expect(res.success, `expected ${bad} to be rejected`).toBe(false);
    }
  });

  it("accepts real calendar dates including leap days", () => {
    for (const ok of ["2024-02-29", "2026-12-31", "2025-01-01"]) {
      const res = v.safeParse(UploadPayloadSchema, {
        ...validInput,
        daily: [{ ...validInput.daily[0]!, date: ok }],
      });
      expect(res.success, `expected ${ok} to pass`).toBe(true);
    }
  });
});
