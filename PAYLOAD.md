# Payload

The exact shape of what `vibeking publish` POSTs to the API. Defined in [`src/redaction.ts`](./src/redaction.ts) as `UploadPayloadSchema` and enforced with Valibot `v.strictObject` — unknown keys throw before send.

## Top-level

```ts
{
  schemaVersion: 4,                 // bumped on breaking shape changes
  source: "claude_code",            // only source supported today
  cliVersion: string,               // semver-ish, e.g. "0.0.1"
  scannedAt: string,                // ISO 8601 datetime
  daily: DailyAggregate[]           // max 366 rows
}
```

## DailyAggregate

```ts
{
  date: string,                     // "YYYY-MM-DD"
  inputTokens: number,              // >= 0, integer
  outputTokens: number,             // >= 0, integer
  cacheReadTokens: number,          // >= 0, integer
  cacheWriteTokens: number,         // >= 0, integer
  sessions: number,                 // >= 0, integer (count of distinct Claude Code sessions on that date)
  assistantMessages: number,        // >= 0, integer (total assistant turns on that date)
  toolCalls: number,                // >= 0, integer (total tool_use blocks emitted by the assistant)
  toolErrors: number,               // >= 0, integer (count of tool_result blocks with is_error: true)
  totalActiveMinutes: number,       // >= 0, integer, max 1440 — sum of session durations that day
  longestSessionMinutes: number,    // >= 0, integer, max 1440 — longest single session that day
  filesTouched: number,             // >= 0, integer — distinct file paths seen in Read/Edit/Write/MultiEdit/NotebookEdit/NotebookRead tool_use inputs; paths discarded after counting, only count ships
  linesAdded: number,               // >= 0, integer — sum of newline deltas added across Edit/Write/MultiEdit
  linesRemoved: number,             // >= 0, integer — symmetric: removed lines
  hookErrors: number,               // >= 0, integer — count of attachment records with non-zero exitCode
  responseLatencyMsP50: number,     // >= 0, integer, max 3_600_000 — median time between user record and next assistant record in a session
  responseLatencyMsP95: number,     // >= 0, integer, max 3_600_000 — p95 of the same
  projectsActive: number,           // >= 0, integer, max 10_000 — distinct cwd strings; strings discarded after counting
  gitBranchesActive: number,        // >= 0, integer, max 10_000 — distinct gitBranch strings; strings discarded
  mcpServersUsed: number,           // >= 0, integer, max 10_000 — distinct MCP server prefixes; server names discarded
  sidechainMessages: number,        // >= 0, integer — assistant turns where isSidechain was true
  skillsUsed: number,               // >= 0, integer, max 10_000 — distinct input.skill values across Skill tool calls; names discarded after counting
  subagentTypesUsed: number,        // >= 0, integer, max 10_000 — distinct input.subagent_type values across Task / Agent tool calls (Claude Code 1.x / 2.x); names discarded
  worktreeEvents: number,           // >= 0, integer — count of type:"worktree-state" records (cmux/worktree power-user signal)
  fileHistorySnapshots: number,     // >= 0, integer — count of type:"file-history-snapshot" records
  modelBreakdown: Record<string, number>,                  // model name → fraction of assistant turns; max 32 keys
  toolUseBreakdown: Record<ToolKey, number>,               // tool name → fraction of toolCalls
  stopReasonBreakdown: Record<StopReason, number>,         // stop_reason → fraction of assistant turns
  permissionModeBreakdown: Record<PermissionMode, number>, // permission mode → fraction of mode-change events
  hookEventCounts: Record<HookEvent, number>,              // hook event name → count of attachments fired
  skillBreakdown: Record<SkillKey, number>,                // skill name → fraction of Skill invocations; user-specific names collapse to `other`
  subagentTypeBreakdown: Record<SubagentTypeKey, number>,  // subagent_type → fraction of Task / Agent invocations; user-specific names collapse to `other`
  hourHistogramLocal: number[]      // length 24; assistant turns by local hour-of-day (machine TZ at scan time)
}
```

`ToolKey` is a closed allowlist of Claude Code built-in tools (Bash, Read, Edit, Write, MultiEdit, Grep, Glob, NotebookRead, NotebookEdit, WebFetch, WebSearch, Task, TodoWrite, TodoRead, ExitPlanMode, Skill, AskUserQuestion, ScheduleWakeup, ShareOnboardingGuide, ToolSearch, Monitor, Agent) plus two buckets: `mcp` (any `mcp__*` tool name is collapsed here so installed-server names don't leak) and `other`.

`StopReason` is a closed allowlist of Anthropic API values: `end_turn`, `tool_use`, `max_tokens`, `stop_sequence`, `pause_turn`, `refusal`, plus two buckets: `none` (the record had `stop_reason: null` — Claude Code logs parallel tool calls as separate records and intermediate ones carry null) and `other` (forward-compat for values added to the Anthropic API after this CLI shipped).

`PermissionMode` is a closed allowlist: `default`, `acceptEdits`, `plan`, `bypassPermissions`, `auto`, `bubble`, plus `other` for forward-compat with new modes.

`HookEvent` is a closed allowlist of Claude Code hook event names: `SessionStart`, `UserPromptSubmit`, `PreToolUse`, `PostToolUse`, `Stop`, `SubagentStop`, `Notification`, `SessionEnd`, `PreCompact`, plus `other` for forward-compat.

`skillBreakdown` keys are validated against an auto-synced token set: any skill name whose value (or the segment before its `:` namespace) appears in either (a) the daily-refreshed token list at [`src/generated/marketplace-tokens.ts`](./src/generated/marketplace-tokens.ts) (1,400+ tokens sourced from [claudemarketplaces.com/sitemap.xml](https://claudemarketplaces.com/sitemap.xml) via `pnpm sync-marketplace`), or (b) a small hand-curated supplement in [`src/redaction.ts`](./src/redaction.ts) (`CURATED_PUBLIC_TOKENS`) for popular plugins the index has missed. Everything else collapses to `other` at the scanner. User-installed plugin names (`brain:*`, `gsd-*`, internal codenames) never leave the machine.

`subagentTypeBreakdown` keys are validated against the union of (a) built-in Claude Code subagent types (`general-purpose`, `Explore`, `Plan`, `claude-code-guide`, `statusline-setup`), (b) the same auto-synced marketplace tokens used for skills (because marketplace agents reuse plugin namespaces), and (c) `other`.

## NOT included

The schema is `v.strictObject` — anything not listed above causes the build to throw locally before the network request fires. The redaction test suite specifically covers:

- `filePath` / file path-shaped strings → rejected
- `/Users/...`, `~/...`, `C:\Users\...` strings inside `modelBreakdown` keys → rejected
- `prompt`, `content`, `text`, `message` keys → rejected
- machine identifiers (hostnames, MAC addresses) → rejected
- environment variables → rejected
- repo names, project names, anything resembling a path component → rejected

See [`src/__tests__/redaction.test.ts`](./src/__tests__/redaction.test.ts) for the concrete cases, and [`src/__tests__/upload-payload-snapshot.test.ts`](./src/__tests__/upload-payload-snapshot.test.ts) for the fixture-based wire-format snapshot.

## Server-side validation

The API validates the payload against the same `UploadPayloadSchema` on receipt, plus a second-stage anti-cheat gate for plausibility checks — impossible burn, future dates, oversize backfills, etc. Rejection-reason codes are part of the public wire contract and live in the server repo.

The anti-cheat heuristics themselves live in the private platform repo — they have to, or attackers optimize around them.

## Verify locally

```bash
npx vibeking inspect-upload
```

Prints the exact payload — same function, same arguments as `vibeking publish`. See [PRIVACY.md](./PRIVACY.md) for more on this guarantee.
