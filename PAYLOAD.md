# Payload

The exact shape of what `vibeking publish` POSTs to the API. Defined in [`src/redaction.ts`](./src/redaction.ts) as `UploadPayloadSchema` and enforced with Valibot `v.strictObject` — unknown keys throw before send. The server validates against the same schema on receipt.

## Top-level

```ts
{
  schemaVersion: 6,                 // bumped on breaking shape changes
  cliVersion: string,               // semver-ish, e.g. "0.1.0" (matches /^\d+\.\d+\.\d+(-[a-z0-9.]+)?$/i)
  installationId: string,           // 1..64 chars; server-issued stable identity for this CLI install
  scannedAt: string,                // ISO 8601 datetime
  daily: DailyAggregate[]           // 1..366 rows, unique by `date`
}
```

`installationId` is required as of v6. The CLI calls `POST /v1/installations/register` on first run and caches the returned id in `~/.vibeking/config.json`. The server rejects payloads with an unknown id (`installation_unknown`) or revoked id (`installation_revoked`); a missing id maps to `installation_required` so the CLI knows to register and retry. Multi-device users (home + office) have one id per machine; the server SUMs shards across installations at read time so working from two boxes adds rather than collapsing.

## DailyAggregate

```ts
{
  date: string,                     // "YYYY-MM-DD", must be a real calendar date
  shards: DailyShard[],             // 1..64 entries, unique by (tool, model)
  totalActiveMinutes: number,       // 0..1440 — sum of session durations that day
  longestSessionMinutes: number,    // 0..1440 — longest single session that day
  filesTouched: number,             // 0..10_000_000 — distinct file paths seen in Read/Edit/Write/MultiEdit/NotebookEdit/NotebookRead tool_use inputs; paths discarded after counting
  linesAdded: number,               // 0..100_000_000 — newline deltas added across Edit/Write/MultiEdit
  linesRemoved: number,             // 0..100_000_000 — symmetric: removed lines
  projectsActive: number,           // 0..10_000 — distinct cwd strings; strings discarded after counting
  gitBranchesActive: number,        // 0..10_000 — distinct gitBranch strings; strings discarded
  worktreeEvents: number,           // 0..10_000_000 — count of type:"worktree-state" records (cmux/worktree power-user signal)
  fileHistorySnapshots: number,     // 0..10_000_000 — count of type:"file-history-snapshot" records
  hourHistogramLocal: number[]      // length 24; assistant turns by local hour-of-day (machine TZ at scan time)
}
```

Token counts, tool / model / stop_reason / permission / hook / skill / subagent breakdowns, session counts, assistant message counts, and response latency live inside `shards[]`, not at the day level. The server rolls them up at read time.

Rolled-day token totals (sum across shards) are additionally capped at 10¹³ per field — high enough for legitimate users, low enough to prevent overflow when summed across 366 days.

## DailyShard

A shard is one `(tool, model)` pair for the day. Built-in Claude Code shards carry an additional `claudeCodeExtras` block with the CC-specific telemetry; other tools (when their scanners ship in future) will carry their own `<tool>Extras` block.

### Shared fields (every shard)

```ts
{
  tool: "claude-code" | <other supported tool>,
  model: string,                    // 1..64 chars, matches /^[a-z0-9][a-z0-9._:/\-]{0,63}$/i — rejects prompt text and file-path-shaped strings
  inputTokens: number,              // 0..1e13, integer
  outputTokens: number,             // 0..1e13, integer
  cacheReadTokens: number,          // 0..1e13, integer
  cacheWriteTokens: number,         // 0..1e13, integer
  sessions: number,                 // 0..1_000_000 — distinct Claude Code sessions for this (tool, model) on this date
  assistantMessages: number,        // 0..10_000_000 — assistant turns for this shard
  toolCalls: number,                // 0..10_000_000 — tool_use blocks emitted
  toolErrors: number,               // 0..10_000_000 — tool_result blocks with is_error: true
  responseLatencyMsP50: number,     // 0..3_600_000 — median time between user record and next assistant record in a session
  responseLatencyMsP95: number,     // 0..3_600_000 — p95 of the same
}
```

### `claude-code` shard extras

Only present on `tool: "claude-code"` shards.

```ts
claudeCodeExtras: {
  toolUseBreakdown: Record<ToolKey, number>,               // tool name → fraction of toolCalls
  stopReasonBreakdown: Record<StopReason, number>,         // stop_reason → fraction of assistant turns
  permissionModeBreakdown: Record<PermissionMode, number>, // permission mode → fraction of mode-change events
  hookEventCounts: Record<HookEvent, number>,              // hook event name → count of attachments fired
  hookErrors: number,                                       // count of attachment records with non-zero exitCode
  skillBreakdown: Record<SkillKey, number>,                // skill name → fraction of Skill invocations; user-specific names collapse to `other`
  subagentTypeBreakdown: Record<SubagentTypeKey, number>,  // subagent_type → fraction of Task / Agent invocations; user-specific names collapse to `other`
  skillsUsed: number,                                       // 0..10_000 — distinct input.skill values across Skill tool calls; names discarded after counting
  subagentTypesUsed: number,                                // 0..10_000 — distinct input.subagent_type values across Task / Agent tool calls
  mcpServersUsed: number,                                   // 0..10_000 — distinct MCP server prefixes; server names discarded
  sidechainMessages: number,                                // 0..10_000_000 — assistant turns where isSidechain was true
}
```

## Allowlists

All breakdown keys are validated against closed allowlists at parse time. Anything outside the allowlist either collapses to a bucket (`other`, `mcp`, `none`) at the scanner or — if a strict picklist — throws before the network request fires.

`ToolKey` is a closed allowlist of Claude Code built-in tools (Bash, Read, Edit, Write, MultiEdit, Grep, Glob, NotebookRead, NotebookEdit, WebFetch, WebSearch, Task, TodoWrite, TodoRead, ExitPlanMode, Skill, AskUserQuestion, ScheduleWakeup, ShareOnboardingGuide, ToolSearch, Monitor, Agent) plus two buckets: `mcp` (any `mcp__*` tool name is collapsed here so installed-server names don't leak) and `other`.

`StopReason` is a closed allowlist of Anthropic API values: `end_turn`, `tool_use`, `max_tokens`, `stop_sequence`, `pause_turn`, `refusal`, plus two buckets: `none` (the record had `stop_reason: null` — Claude Code logs parallel tool calls as separate records and intermediate ones carry null) and `other` (forward-compat for values added to the Anthropic API after this CLI shipped).

`PermissionMode` is a closed allowlist: `default`, `acceptEdits`, `plan`, `bypassPermissions`, `auto`, `bubble`, plus `other` for forward-compat.

`HookEvent` is a closed allowlist of Claude Code hook event names: `SessionStart`, `UserPromptSubmit`, `PreToolUse`, `PostToolUse`, `Stop`, `SubagentStop`, `Notification`, `SessionEnd`, `PreCompact`, plus `other` for forward-compat.

`skillBreakdown` keys are validated against an auto-synced token set: any skill name whose value (or the segment before its `:` namespace) appears in either (a) the daily-refreshed token list at [`src/generated/marketplace-tokens.ts`](./src/generated/marketplace-tokens.ts) (sourced from [claudemarketplaces.com/sitemap.xml](https://claudemarketplaces.com/sitemap.xml) via `pnpm sync-marketplace`), or (b) a small hand-curated supplement in [`src/redaction.ts`](./src/redaction.ts) (`CURATED_PUBLIC_INVOCATIONS`) for popular plugins the index has missed. Everything else collapses to `other` at the scanner. User-installed plugin names (`brain:*`, `gsd-*`, internal codenames) never leave the machine.

`subagentTypeBreakdown` keys are validated against the union of (a) built-in Claude Code subagent types (`general-purpose`, `Explore`, `Plan`, `claude-code-guide`, `statusline-setup`), (b) the same auto-synced marketplace tokens used for skills (because marketplace agents reuse plugin namespaces), and (c) `other`.

## Example wire payload

A minimal real-shape payload for two days of Claude Code activity:

```json
{
  "schemaVersion": 6,
  "cliVersion": "0.1.0",
  "installationId": "inst_abc123",
  "scannedAt": "2026-05-14T12:00:00.000Z",
  "daily": [
    {
      "date": "2026-05-13",
      "shards": [
        {
          "tool": "claude-code",
          "model": "claude-opus-4-7",
          "inputTokens": 180,
          "outputTokens": 360,
          "cacheReadTokens": 90,
          "cacheWriteTokens": 45,
          "sessions": 2,
          "assistantMessages": 4,
          "toolCalls": 5,
          "toolErrors": 1,
          "responseLatencyMsP50": 30000,
          "responseLatencyMsP95": 90000,
          "claudeCodeExtras": {
            "toolUseBreakdown": { "Bash": 0.2, "Read": 0.4, "Write": 0.2, "Grep": 0.2 },
            "stopReasonBreakdown": { "end_turn": 0.5, "tool_use": 0.5 },
            "permissionModeBreakdown": { "plan": 1 },
            "hookEventCounts": { "PreToolUse": 1, "PostToolUse": 1 },
            "hookErrors": 1,
            "skillBreakdown": {},
            "subagentTypeBreakdown": {},
            "skillsUsed": 0,
            "subagentTypesUsed": 0,
            "mcpServersUsed": 0,
            "sidechainMessages": 1
          }
        }
      ],
      "totalActiveMinutes": 7,
      "longestSessionMinutes": 5,
      "filesTouched": 3,
      "linesAdded": 3,
      "linesRemoved": 0,
      "projectsActive": 2,
      "gitBranchesActive": 2,
      "worktreeEvents": 1,
      "fileHistorySnapshots": 0,
      "hourHistogramLocal": [0,0,0,0,0,0,0,0,0,2,0,0,0,0,2,0,0,0,0,0,0,0,0,0]
    }
  ]
}
```

The fixture-based snapshot at [`src/__tests__/__snapshots__/upload-payload-snapshot.test.ts.snap`](./src/__tests__/__snapshots__/upload-payload-snapshot.test.ts.snap) is the byte-stable authoritative example. If it changes, the wire contract changed.

## NOT included

The schema is `v.strictObject` — anything not listed above causes the build to throw locally before the network request fires. The redaction test suite specifically covers:

- `filePath` / file path-shaped strings → rejected
- `/Users/...`, `~/...`, `C:\Users\...` strings inside `model` keys → rejected
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
