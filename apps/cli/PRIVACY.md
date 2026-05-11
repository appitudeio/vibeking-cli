# Privacy

The VibeKing CLI is open source so you can audit this for yourself. Everything below is verifiable in the source — see the links.

## What gets read locally

The CLI reads files under `~/.claude/projects/*/memory.jsonl`. These are Claude Code's local session archives. The scanner extracts only **assistant** message records and pulls out:

- timestamps
- model names
- token usage counts (`input_tokens`, `output_tokens`, `cache_creation_input_tokens`, `cache_read_input_tokens`)

That's it. The scanner code is at [`src/scanners/claudeCode.ts`](./src/scanners/claudeCode.ts) — short enough to read in five minutes.

## What gets uploaded

**Only** when you run `vibeking publish` (never on `vibeking` / `vibeking scan` / `vibeking inspect-upload` — those are local-only).

The payload schema is documented in [PAYLOAD.md](./PAYLOAD.md). Specifically:

- aggregate token counts per day (input, output, cache read, cache write)
- session counts per day
- model usage breakdowns per day (model name → token count)
- the date string (`YYYY-MM-DD`)
- CLI version
- a top-level `scannedAt` timestamp

## What NEVER leaves your machine

- prompts
- assistant responses
- code (yours or assistant-generated)
- file paths
- repo names
- project names (the folder names under `~/.claude/projects/`)
- transcript content of any kind
- machine identifiers (hostname, MAC, etc.)
- environment variables

The payload schema lives at [`packages/core/src/redaction.ts`](../../packages/core/src/redaction.ts) and is enforced with Zod `.strict()` — any unknown field throws before the request leaves your machine. The test suite at [`packages/core/src/__tests__/redaction.test.ts`](../../packages/core/src/__tests__/redaction.test.ts) covers this with concrete attack inputs (paths shaped like `/Users/victim/Code/secret-repo/api.ts`, fields named `filePath`, etc.).

## How to verify

```bash
npx vibeking inspect-upload
```

This prints the exact JSON that `vibeking publish` would send — same function, same arguments. The shared helper is [`src/util/buildPayload.ts`](./src/util/buildPayload.ts); both commands import it, so they cannot drift.

If you want to be extra sure: route the CLI through a local proxy and diff.

```bash
VIBEKING_API_URL=http://localhost:9999 vibeking publish
# then inspect the request your proxy received
```

## Auth

`vibeking login` does a GitHub OAuth device-flow. A long-lived token is saved to `~/.vibeking/config.json` with `chmod 600`. The token authenticates you to the server; revoke it server-side anytime via your profile page.

## Reporting

Found something that contradicts any of the above? Open an issue. Privacy bugs are top priority.
