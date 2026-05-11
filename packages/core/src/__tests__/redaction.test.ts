import { describe, it, expect } from "vitest";
import {
  buildUploadPayload,
  UploadPayloadSchema,
  type UploadPayload,
} from "../redaction.js";

const validInput: UploadPayload = {
  schemaVersion: 1,
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
      modelBreakdown: { "claude-opus-4-7": 1 },
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
          modelBreakdown: { "claude-opus-4-7": 1 },
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
      "cacheReadTokens",
      "cacheWriteTokens",
      "date",
      "inputTokens",
      "modelBreakdown",
      "outputTokens",
      "sessions",
    ]);
  });
});

describe("UploadPayloadSchema", () => {
  it("passes a clean payload", () => {
    expect(UploadPayloadSchema.safeParse(validInput).success).toBe(true);
  });

  it("rejects unexpected top-level keys (e.g., a leaked prompt field)", () => {
    const res = UploadPayloadSchema.safeParse({
      ...validInput,
      prompt: "leaked!",
    });
    expect(res.success).toBe(false);
  });

  it("rejects unexpected per-day keys (e.g., a leaked file path)", () => {
    const res = UploadPayloadSchema.safeParse({
      ...validInput,
      daily: [{ ...validInput.daily[0]!, filePath: "/secrets/x.ts" }],
    });
    expect(res.success).toBe(false);
  });

  it("rejects bad date format", () => {
    const res = UploadPayloadSchema.safeParse({
      ...validInput,
      daily: [{ ...validInput.daily[0]!, date: "yesterday" }],
    });
    expect(res.success).toBe(false);
  });

  it("rejects negative tokens", () => {
    const res = UploadPayloadSchema.safeParse({
      ...validInput,
      daily: [{ ...validInput.daily[0]!, inputTokens: -1 }],
    });
    expect(res.success).toBe(false);
  });

  it("rejects model keys containing prompt-like text or file paths", () => {
    const leak = UploadPayloadSchema.safeParse({
      ...validInput,
      daily: [
        {
          ...validInput.daily[0]!,
          modelBreakdown: { "USER PROMPT: my AWS key is AKIA…": 1 },
        },
      ],
    });
    expect(leak.success).toBe(false);

    const pathLeak = UploadPayloadSchema.safeParse({
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
    const res = UploadPayloadSchema.safeParse({
      ...validInput,
      daily: [{ ...validInput.daily[0]!, modelBreakdown: tooMany }],
    });
    expect(res.success).toBe(false);
  });

  it("caps tokens at 1e13 per field", () => {
    const res = UploadPayloadSchema.safeParse({
      ...validInput,
      daily: [{ ...validInput.daily[0]!, inputTokens: 1e14 }],
    });
    expect(res.success).toBe(false);
  });

  it("rejects non-semver cliVersion (potential leak vector)", () => {
    const res = UploadPayloadSchema.safeParse({
      ...validInput,
      cliVersion: "totally not a version — actually a leaked prompt",
    });
    expect(res.success).toBe(false);
  });
});
