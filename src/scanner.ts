import { readdir } from "node:fs/promises";
import { createReadStream } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline";
import {
  isIsoDate,
  MAX_LINES_PER_DAY,
  NAMED_TOOLS,
  NAMED_STOP_REASONS,
  NAMED_PERMISSION_MODES,
  NAMED_HOOK_EVENTS,
  NAMED_SKILLS,
  NAMED_SUBAGENT_TYPES,
  type ToolKey,
  type StopReasonKey,
  type PermissionModeKey,
  type HookEventKey,
  type SkillKey,
  type SubagentTypeKey,
} from "./redaction.js";
import type { DailyAggregate, ScanSummary } from "./types.js";

const CLAUDE_PROJECTS_DIR = join(homedir(), ".claude", "projects");

// Bounded parallelism for parseFile. JS is single-threaded so the per-line
// Map mutations are safe; we just want to avoid blowing through the OS file-
// descriptor limit on users with hundreds of project JSONLs.
const FILE_CONCURRENCY = 8;

// The upload payload schema caps `daily` at 366 entries (see redaction.ts).
// Trim before returning so a multi-year user's `publish` doesn't silently
// fail validation; they get the most recent year, which is what matters for
// rank anyway.
const MAX_DAILY_ENTRIES = 366;

// Outliers: latencies > 1h are "left it sitting overnight", not real waits.
const MAX_LATENCY_MS = 60 * 60 * 1000;

// 24h cap on per-day session durations — bounds any clock-skew nonsense.
const MAX_DAY_MINUTES = 1440;

const MS_PER_HOUR = 3_600_000;

// Closed allowlists imported from redaction.ts — same constant array drives
// both the runtime membership test here and the schema picklist there, so
// the two cannot drift.
const KNOWN_TOOLS = new Set<string>(NAMED_TOOLS);
const KNOWN_STOP_REASONS = new Set<string>(NAMED_STOP_REASONS);
const KNOWN_PERMISSION_MODES = new Set<string>(NAMED_PERMISSION_MODES);
const KNOWN_HOOK_EVENTS = new Set<string>(NAMED_HOOK_EVENTS);
const KNOWN_SKILLS = new Set<string>(NAMED_SKILLS);
const KNOWN_SUBAGENT_TYPES = new Set<string>(NAMED_SUBAGENT_TYPES);

// Tools whose input.file_path is a real local file path. Used for
// filesTouched (count only) — the strings stay in scanner memory inside
// the per-day Set, never reach finalizeDay's return.
const PATH_TOOLS = new Set<string>([
  "Read",
  "Edit",
  "Write",
  "MultiEdit",
  "NotebookRead",
  "NotebookEdit",
]);

type AssistantContentBlock =
  | { type: "tool_use"; name?: string; input?: Record<string, unknown> }
  | { type: "text"; text?: string }
  | { type: "thinking" }
  | { type: string };

type RecordWithSourceContext = {
  cwd?: string;
  gitBranch?: string;
};

type AssistantRecord = RecordWithSourceContext & {
  type: "assistant";
  timestamp?: string;
  sessionId?: string;
  isSidechain?: boolean;
  message?: {
    model?: string;
    stop_reason?: string | null;
    content?: AssistantContentBlock[];
    usage?: {
      input_tokens?: number;
      output_tokens?: number;
      cache_creation_input_tokens?: number;
      cache_read_input_tokens?: number;
    };
  };
};

type UserContentBlock =
  | { type: "tool_result"; is_error?: boolean }
  | { type: string };

type UserRecord = RecordWithSourceContext & {
  type: "user";
  timestamp?: string;
  sessionId?: string;
  message?: {
    content?: UserContentBlock[] | string;
  };
};

type PermissionModeRecord = {
  type: "permission-mode";
  permissionMode?: string;
  sessionId?: string;
};

type AttachmentRecord = RecordWithSourceContext & {
  type: "attachment";
  timestamp?: string;
  attachment?: {
    hookEvent?: string;
    exitCode?: number;
  };
};

// worktree-state records have no fields we read (we only count occurrences),
// so we don't bother with a typed alias for them.

type FileHistorySnapshotRecord = {
  type: "file-history-snapshot";
  snapshot?: {
    timestamp?: string;
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
  const files = await collectJsonlFiles(rootDir);
  const byDate = new Map<string, MutableDay>();

  for (let i = 0; i < files.length; i += FILE_CONCURRENCY) {
    const batch = files.slice(i, i + FILE_CONCURRENCY);
    await Promise.all(batch.map((f) => parseFile(f, byDate)));
  }

  const sorted = Array.from(byDate.values())
    .map(finalizeDay)
    .sort((a, b) => (a.date < b.date ? -1 : 1));
  const daily = sorted.slice(-MAX_DAILY_ENTRIES);

  if (daily.length === 0) return emptySummary();

  if (sorted.length > MAX_DAILY_ENTRIES) {
    const dropped = sorted.length - MAX_DAILY_ENTRIES;
    process.stderr.write(
      `vibeking: trimmed scan to most recent ${MAX_DAILY_ENTRIES} days (${dropped} older day${dropped === 1 ? "" : "s"} omitted from upload)\n`
    );
  }

  return {
    source: "claude_code",
    daily,
    firstDate: daily[0]!.date,
    lastDate: daily[daily.length - 1]!.date,
    totalDays: daily.length,
    activeDays: daily.filter((d) => d.inputTokens + d.outputTokens > 0).length,
  };
}

type SessionWindow = { firstMs: number; lastMs: number };

type MutableDay = {
  date: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  sessions: Map<string, SessionWindow>;
  // Per-record assistant/tool counters are NOT stored here — they're
  // derivable as `sumMap(stopReasons)` and `sumMap(tools)` respectively.
  models: Map<string, number>;
  tools: Map<ToolKey, number>;
  stopReasons: Map<StopReasonKey, number>;
  permissionModes: Map<PermissionModeKey, number>;
  hookEvents: Map<HookEventKey, number>;
  skills: Map<SkillKey, number>;
  subagentTypes: Map<SubagentTypeKey, number>;
  hourHistogramLocal: number[];
  // Strings live here for the scan duration, but only .size is read into
  // the DailyAggregate that `finalizeDay` returns. MutableDay is module-
  // private and never serialized.
  touchedPaths: Set<string>;
  cwds: Set<string>;
  gitBranches: Set<string>;
  mcpServers: Set<string>;
  skillsSeen: Set<string>;
  subagentTypesSeen: Set<string>;
  linesAdded: number;
  linesRemoved: number;
  toolErrors: number;
  hookErrors: number;
  sidechainMessages: number;
  worktreeEvents: number;
  fileHistorySnapshots: number;
  latenciesMs: number[];
  // Cached so we don't allocate a Date object per assistant record just to
  // read getTimezoneOffset(). DST transitions never happen mid-day in 99%
  // of timezones, so one read per day is correct.
  tzOffsetMs: number | null;
};

function makeDay(date: string): MutableDay {
  return {
    date,
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    sessions: new Map<string, SessionWindow>(),
    models: new Map<string, number>(),
    tools: new Map<ToolKey, number>(),
    stopReasons: new Map<StopReasonKey, number>(),
    permissionModes: new Map<PermissionModeKey, number>(),
    hookEvents: new Map<HookEventKey, number>(),
    skills: new Map<SkillKey, number>(),
    subagentTypes: new Map<SubagentTypeKey, number>(),
    hourHistogramLocal: new Array<number>(24).fill(0),
    touchedPaths: new Set<string>(),
    cwds: new Set<string>(),
    gitBranches: new Set<string>(),
    mcpServers: new Set<string>(),
    skillsSeen: new Set<string>(),
    subagentTypesSeen: new Set<string>(),
    linesAdded: 0,
    linesRemoved: 0,
    toolErrors: 0,
    hookErrors: 0,
    sidechainMessages: 0,
    worktreeEvents: 0,
    fileHistorySnapshots: 0,
    latenciesMs: [],
    tzOffsetMs: null,
  };
}

function finalizeDay(d: MutableDay): DailyAggregate {
  let total = 0;
  let longest = 0;
  for (const win of d.sessions.values()) {
    const minutes = Math.floor((win.lastMs - win.firstMs) / 60000);
    const capped = Math.max(0, Math.min(minutes, MAX_DAY_MINUTES));
    total += capped;
    if (capped > longest) longest = capped;
  }
  const totalActiveMinutes = Math.min(total, MAX_DAY_MINUTES);

  const assistantMessages = sumMap(d.stopReasons);
  const toolCalls = sumMap(d.tools);
  const permissionModeChanges = sumMap(d.permissionModes);

  const { p50, p95 } = percentiles(d.latenciesMs);

  return {
    source: "claude_code",
    date: d.date,
    inputTokens: d.inputTokens,
    outputTokens: d.outputTokens,
    cacheReadTokens: d.cacheReadTokens,
    cacheWriteTokens: d.cacheWriteTokens,
    sessions: d.sessions.size,
    assistantMessages,
    toolCalls,
    toolErrors: d.toolErrors,
    totalActiveMinutes,
    longestSessionMinutes: longest,
    filesTouched: d.touchedPaths.size,
    // Clamp at finalize so a single Write tool with 1e8+ newlines in its
    // content can't push us past LineCountSchema's bound and crash v.parse
    // for the entire publish.
    linesAdded: Math.min(d.linesAdded, MAX_LINES_PER_DAY),
    linesRemoved: Math.min(d.linesRemoved, MAX_LINES_PER_DAY),
    hookErrors: d.hookErrors,
    responseLatencyMsP50: p50,
    responseLatencyMsP95: p95,
    projectsActive: d.cwds.size,
    gitBranchesActive: d.gitBranches.size,
    mcpServersUsed: d.mcpServers.size,
    sidechainMessages: d.sidechainMessages,
    skillsUsed: d.skillsSeen.size,
    subagentTypesUsed: d.subagentTypesSeen.size,
    worktreeEvents: d.worktreeEvents,
    fileHistorySnapshots: d.fileHistorySnapshots,
    modelBreakdown: shareMap(d.models, assistantMessages),
    toolUseBreakdown: shareMap(d.tools, toolCalls),
    stopReasonBreakdown: shareMap(d.stopReasons, assistantMessages),
    permissionModeBreakdown: shareMap(d.permissionModes, permissionModeChanges),
    hookEventCounts: Object.fromEntries(d.hookEvents),
    skillBreakdown: shareMap(d.skills, sumMap(d.skills)),
    subagentTypeBreakdown: shareMap(d.subagentTypes, sumMap(d.subagentTypes)),
    hourHistogramLocal: d.hourHistogramLocal.slice(),
  };
}

function sumMap(m: Map<string, number>): number {
  let n = 0;
  for (const v of m.values()) n += v;
  return n;
}

function shareMap(
  counts: Map<string, number>,
  total: number
): Record<string, number> {
  if (total <= 0 || counts.size === 0) return {};
  const out: Record<string, number> = {};
  for (const [key, count] of counts.entries()) {
    out[key] = round(count / total, 4);
  }
  return out;
}

function percentiles(values: number[]): { p50: number; p95: number } {
  if (values.length === 0) return { p50: 0, p95: 0 };
  const sorted = values.slice().sort((a, b) => a - b);
  return {
    p50: pickPercentile(sorted, 0.5),
    p95: pickPercentile(sorted, 0.95),
  };
}

function pickPercentile(sorted: number[], q: number): number {
  // Nearest-rank — produces an actual observation, deterministic, integer-clean.
  const idx = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil(q * sorted.length) - 1)
  );
  return Math.round(sorted[idx]!);
}

async function parseFile(
  path: string,
  byDate: Map<string, MutableDay>
): Promise<void> {
  const stream = createReadStream(path, { encoding: "utf8" });
  const rl = createInterface({ input: stream, crlfDelay: Infinity });

  // permission-mode records carry no timestamp; we attribute them to the day
  // of the most recent dated record in the same file. Records that arrive
  // before any dated record are dropped — buffering was deemed not worth
  // the complexity (mode toggles essentially always follow the first dated
  // record).
  let lastDate: string | null = null;
  let lastUserMs: number | null = null;

  try {
    for await (const line of rl) {
      if (!line) continue;
      let rec: unknown;
      try {
        rec = JSON.parse(line);
      } catch {
        continue;
      }
      if (typeof rec !== "object" || rec === null) continue;
      const type = (rec as { type?: string }).type;

      if (type === "assistant") {
        const dateInfo = ingestAssistant(
          rec as AssistantRecord,
          byDate,
          lastUserMs
        );
        // Clear the latency cursor on EVERY assistant record, even ones
        // that ingestAssistant rejected — otherwise a malformed assistant
        // in the middle of a session would leave a stale user timestamp
        // that paired (and inflated) the next valid latency sample.
        lastUserMs = null;
        if (dateInfo) lastDate = dateInfo.date;
      } else if (type === "user") {
        const ur = rec as UserRecord;
        const ts = parseTs(ur.timestamp);
        const dateInfo = ingestUser(ur, byDate);
        if (dateInfo) lastDate = dateInfo.date;
        if (ts !== null) lastUserMs = ts;
      } else if (type === "permission-mode") {
        if (!lastDate) continue;
        const pm = rec as PermissionModeRecord;
        const mode = normalizePermissionMode(pm.permissionMode);
        incrementMap(byDate.get(lastDate)!.permissionModes, mode);
      } else if (type === "attachment") {
        const dateInfo = ingestAttachment(rec as AttachmentRecord, byDate);
        if (dateInfo) lastDate = dateInfo.date;
      } else if (type === "worktree-state") {
        // No timestamp on these records — attribute via cursor (same as
        // permission-mode). Records before any dated record in the file
        // are dropped.
        if (!lastDate) continue;
        byDate.get(lastDate)!.worktreeEvents += 1;
      } else if (type === "file-history-snapshot") {
        // Timestamp lives at snapshot.timestamp (nested ISO).
        const fhs = rec as FileHistorySnapshotRecord;
        const info = dayFor(fhs.snapshot?.timestamp, byDate);
        if (info) {
          info.day.fileHistorySnapshots += 1;
          lastDate = info.date;
        }
      }
    }
  } finally {
    rl.close();
    stream.close();
  }
}

function incrementMap<K extends string>(m: Map<K, number>, key: K): void {
  m.set(key, (m.get(key) ?? 0) + 1);
}

function dayFor(
  ts: string | undefined,
  byDate: Map<string, MutableDay>
): { day: MutableDay; date: string } | null {
  if (!ts) return null;
  const date = ts.slice(0, 10);
  if (!isIsoDate(date)) return null;
  let day = byDate.get(date);
  if (!day) {
    day = makeDay(date);
    byDate.set(date, day);
  }
  return { day, date };
}

function parseTs(ts: string | undefined): number | null {
  if (!ts) return null;
  const ms = Date.parse(ts);
  return Number.isFinite(ms) ? ms : null;
}

function ingestSourceContext(
  day: MutableDay,
  rec: RecordWithSourceContext
): void {
  if (typeof rec.cwd === "string" && rec.cwd) day.cwds.add(rec.cwd);
  if (typeof rec.gitBranch === "string" && rec.gitBranch) {
    day.gitBranches.add(rec.gitBranch);
  }
}

function ingestAssistant(
  rec: AssistantRecord,
  byDate: Map<string, MutableDay>,
  lastUserMs: number | null
): { date: string } | null {
  const info = dayFor(rec.timestamp, byDate);
  if (!info) return null;
  const { day, date } = info;
  const ts = parseTs(rec.timestamp);

  // Counts and breakdowns run unconditionally once dayFor succeeds. Token
  // sums are gated on `usage` because their fields live there; everything
  // else (tool_use, stop_reason, sidechain, histogram, session window) is
  // present on records that may lack `usage` (compaction emissions, certain
  // streaming partials), and we'd otherwise silently lose those signals.
  if (rec.isSidechain === true) day.sidechainMessages += 1;

  const usage = rec.message?.usage;
  if (usage) {
    day.inputTokens += usage.input_tokens ?? 0;
    day.outputTokens += usage.output_tokens ?? 0;
    day.cacheReadTokens += usage.cache_read_input_tokens ?? 0;
    day.cacheWriteTokens += usage.cache_creation_input_tokens ?? 0;
  }

  if (ts !== null && rec.sessionId) {
    const win = day.sessions.get(rec.sessionId);
    if (!win) day.sessions.set(rec.sessionId, { firstMs: ts, lastMs: ts });
    else {
      if (ts < win.firstMs) win.firstMs = ts;
      if (ts > win.lastMs) win.lastMs = ts;
    }
  }

  ingestSourceContext(day, rec);

  const model = normalizeModelKey(rec.message?.model);
  day.models.set(model, (day.models.get(model) ?? 0) + 1);

  incrementMap(day.stopReasons, normalizeStopReason(rec.message?.stop_reason));

  // Hour histogram — cache the TZ offset on first valid ts per day so we
  // don't allocate a Date object on every assistant record (425k+ on heavy
  // users). DST transitions don't happen mid-day in 99% of timezones.
  if (ts !== null) {
    if (day.tzOffsetMs === null) {
      day.tzOffsetMs = -new Date(ts).getTimezoneOffset() * 60_000;
    }
    const hour = Math.floor((ts + day.tzOffsetMs) / MS_PER_HOUR) % 24;
    const safeHour = ((hour % 24) + 24) % 24;
    day.hourHistogramLocal[safeHour]! += 1;
  }

  if (lastUserMs !== null && ts !== null) {
    const delta = ts - lastUserMs;
    if (delta >= 0 && delta <= MAX_LATENCY_MS) day.latenciesMs.push(delta);
  }

  const content = rec.message?.content;
  if (Array.isArray(content)) {
    for (const block of content) {
      if (block.type !== "tool_use") continue;
      const raw = (block as { name?: string }).name;
      incrementMap(day.tools, normalizeToolName(raw));

      if (raw && raw.startsWith("mcp__")) {
        const server = raw.slice(5).split("__")[0];
        if (server) day.mcpServers.add(server);
      }

      const input = (block as { input?: unknown }).input;
      if (input && typeof input === "object") {
        ingestToolUseInput(day, raw, input as Record<string, unknown>);
      }
    }
  }

  return { date };
}

function ingestToolUseInput(
  day: MutableDay,
  toolName: string | undefined,
  input: Record<string, unknown>
): void {
  if (!toolName) return;

  if (PATH_TOOLS.has(toolName) && typeof input.file_path === "string") {
    day.touchedPaths.add(input.file_path);
  }

  if (toolName === "Edit") {
    addLineDelta(day, input.old_string, input.new_string);
  } else if (toolName === "Write" && typeof input.content === "string") {
    day.linesAdded += countLines(input.content);
  } else if (toolName === "MultiEdit" && Array.isArray(input.edits)) {
    for (const e of input.edits) {
      if (e && typeof e === "object") {
        const obj = e as Record<string, unknown>;
        addLineDelta(day, obj.old_string, obj.new_string);
      }
    }
  } else if (toolName === "Skill" && typeof input.skill === "string" && input.skill) {
    // input.args carries user-intent text and is NEVER read.
    day.skillsSeen.add(input.skill);
    incrementMap(day.skills, normalizeSkillName(input.skill));
  } else if (
    // Claude Code 1.x dispatched subagents via "Task"; 2.x renamed it to
    // "Agent". Real data shows the user's recent sessions use "Agent" almost
    // exclusively. Both tools carry input.subagent_type identically.
    (toolName === "Task" || toolName === "Agent") &&
    typeof input.subagent_type === "string" &&
    input.subagent_type
  ) {
    // input.prompt and input.description carry user content; NEVER read.
    day.subagentTypesSeen.add(input.subagent_type);
    incrementMap(day.subagentTypes, normalizeSubagentType(input.subagent_type));
  }
}

function addLineDelta(
  day: MutableDay,
  oldStr: unknown,
  newStr: unknown
): void {
  const oldLines = typeof oldStr === "string" ? countLines(oldStr) : 0;
  const newLines = typeof newStr === "string" ? countLines(newStr) : 0;
  const delta = newLines - oldLines;
  if (delta > 0) day.linesAdded += delta;
  else if (delta < 0) day.linesRemoved += -delta;
}

// Hot-path: avoid String.split() per Edit/MultiEdit (heavy users see
// thousands of these per day, each with potentially KB-sized strings).
function countLines(s: string): number {
  if (s.length === 0) return 0;
  let n = 1;
  for (let i = 0; i < s.length; i++) if (s.charCodeAt(i) === 10) n++;
  return n;
}

function ingestUser(
  rec: UserRecord,
  byDate: Map<string, MutableDay>
): { date: string } | null {
  const info = dayFor(rec.timestamp, byDate);
  if (!info) return null;
  const { day, date } = info;

  ingestSourceContext(day, rec);

  const content = rec.message?.content;
  if (Array.isArray(content)) {
    for (const block of content) {
      if (block.type === "tool_result") {
        if ((block as { is_error?: boolean }).is_error === true) {
          day.toolErrors += 1;
        }
      }
    }
  }

  return { date };
}

function ingestAttachment(
  rec: AttachmentRecord,
  byDate: Map<string, MutableDay>
): { date: string } | null {
  const info = dayFor(rec.timestamp, byDate);
  if (!info) return null;
  const { day, date } = info;

  ingestSourceContext(day, rec);

  const att = rec.attachment;
  if (att) {
    const ev = normalizeHookEvent(att.hookEvent);
    if (ev) incrementMap(day.hookEvents, ev);
    if (typeof att.exitCode === "number" && att.exitCode !== 0) {
      day.hookErrors += 1;
    }
  }

  return { date };
}

// Claude Code emits internal sentinels like `<synthetic>` for non-LLM
// responses (tool failures, autosynthesized turns). Strip non-alphanumeric
// padding so these still match the redaction allowlist.
function normalizeModelKey(raw: string | undefined): string {
  if (!raw) return "unknown";
  const stripped = raw.replace(/^[^a-z0-9]+/i, "").replace(/[^a-z0-9._:/-]+$/i, "");
  return stripped.slice(0, 64) || "unknown";
}

function isKnownTool(s: string): s is Exclude<ToolKey, "mcp" | "other"> {
  return KNOWN_TOOLS.has(s);
}

function normalizeToolName(raw: string | undefined): ToolKey {
  if (!raw) return "other";
  if (raw.startsWith("mcp__")) return "mcp";
  return isKnownTool(raw) ? raw : "other";
}

function isKnownStopReason(
  s: string
): s is Exclude<StopReasonKey, "none" | "other"> {
  return KNOWN_STOP_REASONS.has(s);
}

// Claude Code logs parallel tool dispatches as separate JSONL records that
// share a message.id; intermediate ones carry stop_reason: null. Keep that
// distinct from "future Anthropic value we don't know about" so the server
// can tell streaming chunks apart from genuine forward-compat noise.
function normalizeStopReason(raw: string | undefined | null): StopReasonKey {
  if (raw == null) return "none";
  return isKnownStopReason(raw) ? raw : "other";
}

function isKnownPermissionMode(
  s: string
): s is Exclude<PermissionModeKey, "other"> {
  return KNOWN_PERMISSION_MODES.has(s);
}

function normalizePermissionMode(raw: string | undefined): PermissionModeKey {
  if (!raw) return "other";
  return isKnownPermissionMode(raw) ? raw : "other";
}

function isKnownHookEvent(s: string): s is Exclude<HookEventKey, "other"> {
  return KNOWN_HOOK_EVENTS.has(s);
}

function normalizeHookEvent(raw: string | undefined): HookEventKey | null {
  if (!raw) return null;
  return isKnownHookEvent(raw) ? raw : "other";
}

function isKnownSkill(s: string): s is Exclude<SkillKey, "other"> {
  return KNOWN_SKILLS.has(s);
}

function normalizeSkillName(raw: string): SkillKey {
  return isKnownSkill(raw) ? raw : "other";
}

function isKnownSubagentType(
  s: string
): s is Exclude<SubagentTypeKey, "other"> {
  return KNOWN_SUBAGENT_TYPES.has(s);
}

function normalizeSubagentType(raw: string): SubagentTypeKey {
  return isKnownSubagentType(raw) ? raw : "other";
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
