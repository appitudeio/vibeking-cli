import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { scanClaudeCodeDir } from "../scanner.js";
import { buildUploadPayload } from "../redaction.js";

// Trust anchor: scanner + buildUploadPayload must produce a stable wire
// payload for known fixture data. The full shape is locked in via vitest
// `toMatchSnapshot` (the .snap file is the byte-stable reference); the
// structural checks below pin the load-bearing invariants in the test
// body so a snapshot drift is debuggable without diffing the .snap.
//
// vitest.setup.ts pins TZ=UTC so the local-hour histogram is deterministic
// on every entry point.

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

  it("produces a stable v6 payload from the synthetic fixture", async () => {
    const summary = await scanClaudeCodeDir(FIXTURE_DIR);
    const payload = buildUploadPayload({
      cliVersion: "0.0.0-test",
      installationId: "inst_snapshot_test",
      daily: summary.daily,
    });

    // Byte-stable reference. Update with `pnpm test -u` after intentional
    // wire-format or scanner changes.
    expect(payload).toMatchSnapshot();

    // Structural invariants — fast to read in CI failures without diffing
    // the .snap blob.
    expect(payload.schemaVersion).toBe(6);
    expect(payload.installationId).toBe("inst_snapshot_test");
    expect(payload.cliVersion).toBe("0.0.0-test");
    expect(payload.scannedAt).toBe("2026-01-20T12:00:00.000Z");
    expect(payload.daily.map((d) => d.date)).toEqual([
      "2026-01-15",
      "2026-01-16",
    ]);
    // Every day has at least one shard, and every CC shard's extras attach
    // to exactly one (highest-token) shard per day.
    for (const day of payload.daily) {
      expect(day.shards.length).toBeGreaterThan(0);
      const ccWithExtras = day.shards.filter(
        (s) => s.tool === "claude-code" && "claudeCodeExtras" in s && s.claudeCodeExtras
      );
      expect(ccWithExtras.length).toBe(1);
    }
  });

  // The fixture's Skill `input.args` and Task/Agent `input.prompt` carry
  // explicit canary strings ("private prompt — never read", "private context
  // — never read"). If a future refactor accidentally surfaces those fields
  // into the payload, this test fails loudly. Same logic as the path-shape
  // tests in redaction.test.ts but for the freeform-text inputs that Tier
  // 1.6 newly touches.
  it("never includes Skill args or Task/Agent prompt content in the payload", async () => {
    const summary = await scanClaudeCodeDir(FIXTURE_DIR);
    const payload = buildUploadPayload({
      cliVersion: "0.0.0-test",
      installationId: "inst_canary_test",
      daily: summary.daily,
    });
    const json = JSON.stringify(payload);
    for (const canary of [
      "private prompt — never read",
      "private context — never read",
      "query users",
      "should-not-leak",
    ]) {
      expect(
        json.includes(canary),
        `payload leaked fixture canary "${canary}"`
      ).toBe(false);
    }
  });
});
