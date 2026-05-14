# Privacy

The VibeKing CLI is open source so you can audit this for yourself. Everything below is verifiable in the source — see the links.

## What gets read locally

The CLI reads files under `~/.claude/projects/*/memory.jsonl` — Claude Code's local session archives. The scanner walks both user and assistant records and pulls out:

- timestamps
- model names
- token usage counts (`input_tokens`, `output_tokens`, `cache_creation_input_tokens`, `cache_read_input_tokens`)
- tool-use counts (allowlisted; MCP tools collapse to a single `mcp` bucket so installed-server names don't leak)
- stop-reason counts
- permission-mode toggles
- hook event names + exit codes (for hook-error counts)
- file path strings (read locally to count distinct values — only the count ships)
- Edit/Write content (read locally to count line deltas — only the totals ship)
- cwd / git branch strings (read locally to count distinct values — only the counts ship)
- `isSidechain` flags, `worktree-state` records, `file-history-snapshot` records
- public-marketplace skill names (`Skill` tool's `input.skill`, classified against the auto-synced [`marketplace-tokens.ts`](./src/generated/marketplace-tokens.ts); user-specific names like `brain:*` collapse to `other`)
- public-marketplace subagent types (`Task` / `Agent` tool's `input.subagent_type`; same classification)

The scanner code is at [`src/scanner.ts`](./src/scanner.ts) — short enough to read in five minutes.

## What gets uploaded

**Only** when you run `vibeking publish` (never on `vibeking` / `vibeking scan` / `vibeking inspect-upload` — those are local-only). The full schema lives in [PAYLOAD.md](./PAYLOAD.md). In categorical summary:

**Top-level envelope:**
- `schemaVersion`, `cliVersion`, `scannedAt` timestamp
- `installationId` — a server-issued stable id for this CLI install (registered on first run; cached in `~/.vibeking/config.json`)

**Per day** (`date: YYYY-MM-DD`):
- `shards[]` — one entry per `(tool, model)` pair, each carrying token counts (input / output / cache read / cache write), session count, assistant message count, tool call count, tool error count, and response latency p50/p95
- Each Claude Code shard additionally carries breakdowns: tool-use, stop-reason, permission-mode, hook-event counts, hook-error count, skill breakdown, subagent-type breakdown, distinct skill / subagent / MCP server counts, sidechain message count
- Day-level rollups: total active minutes, longest session minutes, files touched (count only), lines added / removed, projects active (count only), git branches active (count only), worktree-state event count, file-history-snapshot count, 24-bucket local-hour histogram

All the "distinct count" values discard the underlying strings — only the count ships. All the breakdowns are over allowlisted closed sets; anything outside the allowlist either collapses to a bucket (`other`, `mcp`, `none`) at the scanner or fails schema validation locally before the request fires.

## What NEVER leaves your machine

- prompts
- assistant responses
- code (yours or assistant-generated)
- file paths
- repo names
- project names (the folder names under `~/.claude/projects/`)
- git branch names, cwd strings, MCP server names
- user-installed plugin / skill / subagent names (collapse to `other`)
- transcript content of any kind
- machine identifiers (hostname, MAC, etc.)
- environment variables

The payload schema lives at [`src/redaction.ts`](./src/redaction.ts) and is enforced with Valibot `v.strictObject` — any unknown field throws before the request leaves your machine. The test suite at [`src/__tests__/redaction.test.ts`](./src/__tests__/redaction.test.ts) covers this with concrete attack inputs (paths shaped like `/Users/victim/Code/secret-repo/api.ts`, fields named `filePath`, etc.). The [fixture-based payload snapshot test](./src/__tests__/upload-payload-snapshot.test.ts) also pins the wire format so refactors can't silently change it.

## How to verify

```bash
npx vibeking inspect-upload
```

This prints the exact JSON that `vibeking publish` would send — same function, same arguments. The shared helper is [`src/buildPayload.ts`](./src/buildPayload.ts); both commands import it, so they cannot drift.

If you want to be extra sure: route the CLI through a local proxy and diff.

```bash
VIBEKING_API_URL=http://localhost:9999 vibeking publish
# then inspect the request your proxy received
```

## Auth

`vibeking login` does a GitHub OAuth device-flow. A long-lived token is saved to `~/.vibeking/config.json` with `chmod 600`. The token authenticates you to the server; revoke it server-side anytime via your profile page.

## Reporting

Found something that contradicts any of the above? Open an issue. Privacy bugs are top priority.
