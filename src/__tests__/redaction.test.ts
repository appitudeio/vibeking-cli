import { describe, it, expect } from "vitest";
import * as v from "valibot";
import {
  buildUploadPayload,
  UploadPayloadSchema,
  type UploadPayload,
} from "../redaction.js";

const emptyHistogram = new Array<number>(24).fill(0);

const validInput: UploadPayload = {
  schemaVersion: 4,
  source: "claude_code",
  cliVersion: "0.0.1",
  scannedAt: "2026-05-10T12:00:00.000Z",
  daily: [
    {
      date: "2026-05-10",
      inputTokens: 100,
      outputTokens: 200,
      cacheReadTokens: 50,
      cacheWriteTokens: 25,
      sessions: 3,
      assistantMessages: 12,
      toolCalls: 4,
      toolErrors: 1,
      totalActiveMinutes: 90,
      longestSessionMinutes: 45,
      filesTouched: 8,
      linesAdded: 120,
      linesRemoved: 40,
      hookErrors: 0,
      responseLatencyMsP50: 8000,
      responseLatencyMsP95: 42000,
      projectsActive: 2,
      gitBranchesActive: 3,
      mcpServersUsed: 1,
      sidechainMessages: 2,
      skillsUsed: 3,
      subagentTypesUsed: 2,
      worktreeEvents: 5,
      fileHistorySnapshots: 12,
      modelBreakdown: { "claude-opus-4-7": 1 },
      toolUseBreakdown: { Bash: 0.5, Read: 0.5 },
      stopReasonBreakdown: { end_turn: 0.5, tool_use: 0.5 },
      permissionModeBreakdown: { default: 0.7, plan: 0.3 },
      hookEventCounts: { SessionStart: 2, PreToolUse: 5, PostToolUse: 5 },
      skillBreakdown: { "db-query": 0.6, other: 0.4 },
      subagentTypeBreakdown: { "general-purpose": 0.8, other: 0.2 },
      hourHistogramLocal: emptyHistogram,
    },
  ],
};

describe("buildUploadPayload", () => {
  it("only includes allowlisted fields", () => {
    const payload = buildUploadPayload({
      source: "claude_code",
      cliVersion: "0.0.1",
      daily: [
        {
          source: "claude_code",
          date: "2026-05-10",
          inputTokens: 100,
          outputTokens: 200,
          cacheReadTokens: 50,
          cacheWriteTokens: 25,
          sessions: 3,
          assistantMessages: 12,
          toolCalls: 4,
          toolErrors: 1,
          totalActiveMinutes: 90,
          longestSessionMinutes: 45,
          filesTouched: 8,
          linesAdded: 120,
          linesRemoved: 40,
          hookErrors: 0,
          responseLatencyMsP50: 8000,
          responseLatencyMsP95: 42000,
          projectsActive: 2,
          gitBranchesActive: 3,
          mcpServersUsed: 1,
          sidechainMessages: 2,
          skillsUsed: 3,
          subagentTypesUsed: 2,
          worktreeEvents: 5,
          fileHistorySnapshots: 12,
          modelBreakdown: { "claude-opus-4-7": 1 },
          toolUseBreakdown: { Bash: 0.5, Read: 0.5 },
          stopReasonBreakdown: { end_turn: 0.5, tool_use: 0.5 },
          permissionModeBreakdown: { default: 1 },
          hookEventCounts: { SessionStart: 1 },
          skillBreakdown: { "db-query": 1 },
          subagentTypeBreakdown: { "general-purpose": 1 },
          hourHistogramLocal: emptyHistogram,
        },
      ],
    });

    expect(Object.keys(payload).sort()).toEqual([
      "cliVersion",
      "daily",
      "scannedAt",
      "schemaVersion",
      "source",
    ]);
    expect(Object.keys(payload.daily[0]!).sort()).toEqual([
      "assistantMessages",
      "cacheReadTokens",
      "cacheWriteTokens",
      "date",
      "fileHistorySnapshots",
      "filesTouched",
      "gitBranchesActive",
      "hookErrors",
      "hookEventCounts",
      "hourHistogramLocal",
      "inputTokens",
      "linesAdded",
      "linesRemoved",
      "longestSessionMinutes",
      "mcpServersUsed",
      "modelBreakdown",
      "outputTokens",
      "permissionModeBreakdown",
      "projectsActive",
      "responseLatencyMsP50",
      "responseLatencyMsP95",
      "sessions",
      "sidechainMessages",
      "skillBreakdown",
      "skillsUsed",
      "stopReasonBreakdown",
      "subagentTypeBreakdown",
      "subagentTypesUsed",
      "toolCalls",
      "toolErrors",
      "toolUseBreakdown",
      "totalActiveMinutes",
      "worktreeEvents",
    ]);
  });

  it("emits schemaVersion 4", () => {
    const payload = buildUploadPayload({
      source: "claude_code",
      cliVersion: "0.0.1",
      daily: [],
    });
    expect(payload.schemaVersion).toBe(4);
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

  it("rejects bad date format", () => {
    const res = v.safeParse(UploadPayloadSchema, {
      ...validInput,
      daily: [{ ...validInput.daily[0]!, date: "yesterday" }],
    });
    expect(res.success).toBe(false);
  });

  it("rejects negative tokens", () => {
    const res = v.safeParse(UploadPayloadSchema, {
      ...validInput,
      daily: [{ ...validInput.daily[0]!, inputTokens: -1 }],
    });
    expect(res.success).toBe(false);
  });

  it("rejects model keys containing prompt-like text or file paths", () => {
    const leak = v.safeParse(UploadPayloadSchema, {
      ...validInput,
      daily: [
        {
          ...validInput.daily[0]!,
          modelBreakdown: { "USER PROMPT: my AWS key is AKIA…": 1 },
        },
      ],
    });
    expect(leak.success).toBe(false);

    const pathLeak = v.safeParse(UploadPayloadSchema, {
      ...validInput,
      daily: [
        {
          ...validInput.daily[0]!,
          // Path keys contain leading slash + uppercase + spaces — all rejected
          modelBreakdown: { "/Users/victim/Code/secret-repo/api.ts": 1 },
        },
      ],
    });
    expect(pathLeak.success).toBe(false);
  });

  it("caps modelBreakdown at 32 keys per day", () => {
    const tooMany: Record<string, number> = {};
    for (let i = 0; i < 33; i++) tooMany[`model-${i}`] = 1 / 33;
    const res = v.safeParse(UploadPayloadSchema, {
      ...validInput,
      daily: [{ ...validInput.daily[0]!, modelBreakdown: tooMany }],
    });
    expect(res.success).toBe(false);
  });

  it("caps tokens at 1e13 per field", () => {
    const res = v.safeParse(UploadPayloadSchema, {
      ...validInput,
      daily: [{ ...validInput.daily[0]!, inputTokens: 1e14 }],
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

  it("rejects unknown tool names in toolUseBreakdown (must be in closed allowlist)", () => {
    const res = v.safeParse(UploadPayloadSchema, {
      ...validInput,
      daily: [
        {
          ...validInput.daily[0]!,
          toolUseBreakdown: { LeakedToolName: 1 },
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
          // The scanner buckets mcp__* to "mcp" — leaking the raw name
          // would identify which MCP servers the user has installed.
          toolUseBreakdown: { "mcp__claude_ai_Notion__search": 1 },
        },
      ],
    });
    expect(res.success).toBe(false);
  });

  it("accepts the 'mcp' and 'other' bucket keys", () => {
    const res = v.safeParse(UploadPayloadSchema, {
      ...validInput,
      daily: [
        {
          ...validInput.daily[0]!,
          toolUseBreakdown: { Bash: 0.5, mcp: 0.3, other: 0.2 },
        },
      ],
    });
    expect(res.success).toBe(true);
  });

  it("rejects unknown stop_reason values (must be in closed allowlist)", () => {
    const res = v.safeParse(UploadPayloadSchema, {
      ...validInput,
      daily: [
        {
          ...validInput.daily[0]!,
          stopReasonBreakdown: { not_a_real_reason: 1 },
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

  it("rejects negative counts (assistantMessages, toolCalls, toolErrors)", () => {
    const negMsgs = v.safeParse(UploadPayloadSchema, {
      ...validInput,
      daily: [{ ...validInput.daily[0]!, assistantMessages: -1 }],
    });
    expect(negMsgs.success).toBe(false);

    const negTools = v.safeParse(UploadPayloadSchema, {
      ...validInput,
      daily: [{ ...validInput.daily[0]!, toolCalls: -1 }],
    });
    expect(negTools.success).toBe(false);

    const negErrors = v.safeParse(UploadPayloadSchema, {
      ...validInput,
      daily: [{ ...validInput.daily[0]!, toolErrors: -1 }],
    });
    expect(negErrors.success).toBe(false);
  });

  it("rejects schemaVersion: 3 (previous wire format)", () => {
    const res = v.safeParse(UploadPayloadSchema, {
      ...validInput,
      schemaVersion: 3 as unknown as 4,
    });
    expect(res.success).toBe(false);
  });

  it("rejects schemaVersion: 2 (older wire format)", () => {
    const res = v.safeParse(UploadPayloadSchema, {
      ...validInput,
      schemaVersion: 2 as unknown as 4,
    });
    expect(res.success).toBe(false);
  });

  it("rejects schemaVersion: 1 (oldest wire format)", () => {
    const res = v.safeParse(UploadPayloadSchema, {
      ...validInput,
      schemaVersion: 1 as unknown as 4,
    });
    expect(res.success).toBe(false);
  });

  it("rejects unknown permission modes (must be in closed allowlist)", () => {
    const res = v.safeParse(UploadPayloadSchema, {
      ...validInput,
      daily: [
        {
          ...validInput.daily[0]!,
          permissionModeBreakdown: { sudo: 1 },
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
          permissionModeBreakdown: {
            default: 0.4,
            acceptEdits: 0.3,
            plan: 0.2,
            bypassPermissions: 0.1,
          },
        },
      ],
    });
    expect(res.success).toBe(true);
  });

  it("rejects unknown hook event names (must be in closed allowlist)", () => {
    const res = v.safeParse(UploadPayloadSchema, {
      ...validInput,
      daily: [
        {
          ...validInput.daily[0]!,
          hookEventCounts: { PostDeployHook: 1 },
        },
      ],
    });
    expect(res.success).toBe(false);
  });

  it("rejects negative counts in hookEventCounts", () => {
    const res = v.safeParse(UploadPayloadSchema, {
      ...validInput,
      daily: [
        {
          ...validInput.daily[0]!,
          hookEventCounts: { SessionStart: -1 },
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

  it("rejects negative file/line/latency counts", () => {
    for (const field of [
      "filesTouched",
      "linesAdded",
      "linesRemoved",
      "hookErrors",
      "responseLatencyMsP50",
      "responseLatencyMsP95",
      "projectsActive",
      "gitBranchesActive",
      "mcpServersUsed",
      "sidechainMessages",
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

  it("rejects latency over 1h cap", () => {
    const res = v.safeParse(UploadPayloadSchema, {
      ...validInput,
      daily: [{ ...validInput.daily[0]!, responseLatencyMsP50: 3_600_001 }],
    });
    expect(res.success).toBe(false);
  });

  it("rejects user-specific skill names in skillBreakdown (must be allowlisted or 'other')", () => {
    const res = v.safeParse(UploadPayloadSchema, {
      ...validInput,
      daily: [
        {
          ...validInput.daily[0]!,
          // brain:* / gsd-* / omni-* are user-installed; scanner buckets to "other".
          // Leaking the raw name would identify which marketplaces / private plugins
          // the user has installed.
          skillBreakdown: { "brain:plan-update": 1 },
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
          skillBreakdown: {
            "db-query": 0.4,
            "superpowers:brainstorming": 0.3,
            "frontend-design:frontend-design": 0.2,
            other: 0.1,
          },
        },
      ],
    });
    expect(res.success).toBe(true);
  });

  it("rejects user-specific subagent_type names in subagentTypeBreakdown", () => {
    const res = v.safeParse(UploadPayloadSchema, {
      ...validInput,
      daily: [
        {
          ...validInput.daily[0]!,
          subagentTypeBreakdown: { "gsd-executor": 1 },
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
          subagentTypeBreakdown: {
            "general-purpose": 0.5,
            Explore: 0.2,
            Plan: 0.1,
            "superpowers:code-reviewer": 0.1,
            other: 0.1,
          },
        },
      ],
    });
    expect(res.success).toBe(true);
  });

  it("rejects negative counts for tier 1.6 fields", () => {
    for (const field of [
      "skillsUsed",
      "subagentTypesUsed",
      "worktreeEvents",
      "fileHistorySnapshots",
    ] as const) {
      const res = v.safeParse(UploadPayloadSchema, {
        ...validInput,
        daily: [{ ...validInput.daily[0]!, [field]: -1 }],
      });
      expect(res.success, `expected -1 ${field} to be rejected`).toBe(false);
    }
  });
});
