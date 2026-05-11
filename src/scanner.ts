import { readdir } from "node:fs/promises";
import { createReadStream, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline";
import { isIsoDate } from "./core/dateUtils.js";
import type { DailyAggregate, ScanSummary } from "./core/types.js";

const CLAUDE_PROJECTS_DIR = join(homedir(), ".claude", "projects");

type AssistantRecord = {
  type: "assistant";
  timestamp?: string;
  sessionId?: string;
  message?: {
    model?: string;
    usage?: {
      input_tokens?: number;
      output_tokens?: number;
      cache_creation_input_tokens?: number;
      cache_read_input_tokens?: number;
    };
  };
};

export function scanClaudeCode(): Promise<ScanSummary> {
  return scanClaudeCodeDir(CLAUDE_PROJECTS_DIR);
}

/**
 * Same scan, against an explicit projects directory. Used by the fixture-
 * based payload snapshot test; not part of the public CLI surface.
 */
export async function scanClaudeCodeDir(rootDir: string): Promise<ScanSummary> {
  if (!existsSync(rootDir)) {
    return emptySummary();
  }

  const files = await collectJsonlFiles(rootDir);
  const byDate = new Map<string, MutableDay>();

  for (const file of files) {
    await parseFile(file, byDate);
  }

  const daily = Array.from(byDate.values())
    .map(finalizeDay)
    .sort((a, b) => (a.date < b.date ? -1 : 1));

  if (daily.length === 0) return emptySummary();

  return {
    source: "claude_code",
    daily,
    firstDate: daily[0]!.date,
    lastDate: daily[daily.length - 1]!.date,
    totalDays: daily.length,
    activeDays: daily.filter((d) => d.inputTokens + d.outputTokens > 0).length,
  };
}

type MutableDay = {
  date: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  sessions: Set<string>;
  models: Map<string, number>;
};

function finalizeDay(d: MutableDay): DailyAggregate {
  const totalAssistantMsgs =
    Array.from(d.models.values()).reduce((a, b) => a + b, 0) || 1;
  const breakdown: Record<string, number> = {};
  for (const [model, count] of d.models.entries()) {
    breakdown[model] = round(count / totalAssistantMsgs, 4);
  }

  return {
    source: "claude_code",
    date: d.date,
    inputTokens: d.inputTokens,
    outputTokens: d.outputTokens,
    cacheReadTokens: d.cacheReadTokens,
    cacheWriteTokens: d.cacheWriteTokens,
    sessions: d.sessions.size,
    modelBreakdown: breakdown,
  };
}

async function parseFile(
  path: string,
  byDate: Map<string, MutableDay>
): Promise<void> {
  const stream = createReadStream(path, { encoding: "utf8" });
  const rl = createInterface({ input: stream, crlfDelay: Infinity });

  try {
    for await (const line of rl) {
      if (!line) continue;
      let rec: unknown;
      try {
        rec = JSON.parse(line);
      } catch {
        continue;
      }
      if (
        typeof rec !== "object" ||
        rec === null ||
        (rec as { type?: string }).type !== "assistant"
      ) {
        continue;
      }
      ingestAssistant(rec as AssistantRecord, byDate);
    }
  } finally {
    rl.close();
    stream.close();
  }
}

function ingestAssistant(
  rec: AssistantRecord,
  byDate: Map<string, MutableDay>
): void {
  const ts = rec.timestamp;
  if (!ts) return;
  const date = ts.slice(0, 10);
  if (!isIsoDate(date)) return;

  const usage = rec.message?.usage;
  if (!usage) return;

  let day = byDate.get(date);
  if (!day) {
    day = {
      date,
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      sessions: new Set<string>(),
      models: new Map<string, number>(),
    };
    byDate.set(date, day);
  }

  day.inputTokens += usage.input_tokens ?? 0;
  day.outputTokens += usage.output_tokens ?? 0;
  day.cacheReadTokens += usage.cache_read_input_tokens ?? 0;
  day.cacheWriteTokens += usage.cache_creation_input_tokens ?? 0;
  if (rec.sessionId) day.sessions.add(rec.sessionId);
  const model = normalizeModelKey(rec.message?.model);
  day.models.set(model, (day.models.get(model) ?? 0) + 1);
}

// Claude Code emits internal sentinels like `<synthetic>` for non-LLM
// responses (tool failures, autosynthesized turns). Strip non-alphanumeric
// padding so these still match the redaction allowlist.
function normalizeModelKey(raw: string | undefined): string {
  if (!raw) return "unknown";
  const stripped = raw.replace(/^[^a-z0-9]+/i, "").replace(/[^a-z0-9._:/-]+$/i, "");
  return stripped.slice(0, 64) || "unknown";
}

async function collectJsonlFiles(root: string): Promise<string[]> {
  const out: string[] = [];
  let entries;
  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch {
    return out;
  }

  for (const entry of entries) {
    const fullPath = join(root, entry.name);
    if (entry.isDirectory()) {
      const sub = await readdir(fullPath, { withFileTypes: true }).catch(() => []);
      for (const f of sub) {
        if (f.isFile() && f.name.endsWith(".jsonl")) {
          out.push(join(fullPath, f.name));
        }
      }
    } else if (entry.isFile() && entry.name.endsWith(".jsonl")) {
      out.push(fullPath);
    }
  }

  return out;
}

function emptySummary(): ScanSummary {
  return {
    source: "claude_code",
    daily: [],
    firstDate: null,
    lastDate: null,
    totalDays: 0,
    activeDays: 0,
  };
}

function round(n: number, digits: number): number {
  const f = 10 ** digits;
  return Math.round(n * f) / f;
}
