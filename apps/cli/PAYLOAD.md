# Payload

The exact shape of what `vibeking publish` POSTs to the API. Defined in [`packages/core/src/redaction.ts`](../../packages/core/src/redaction.ts) as `UploadPayloadSchema` and enforced with Zod `.strict()` — unknown keys throw before send.

## Top-level

```ts
{
  schemaVersion: 1,                 // bumped on breaking shape changes
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
  modelBreakdown: Record<string, number>   // model name → input tokens for that model, on that day; max 32 keys
}
```

## NOT included

The schema is `.strict()` — anything not listed above causes the build to throw locally before the network request fires. The redaction test suite specifically covers:

- `filePath` / file path-shaped strings → rejected
- `/Users/...`, `~/...`, `C:\Users\...` strings inside `modelBreakdown` keys → rejected
- `prompt`, `content`, `text`, `message` keys → rejected
- machine identifiers (hostnames, MAC addresses) → rejected
- environment variables → rejected
- repo names, project names, anything resembling a path component → rejected

See [`packages/core/src/__tests__/redaction.test.ts`](../../packages/core/src/__tests__/redaction.test.ts) for the concrete cases.

## Server-side validation

The API validates the payload against the same `UploadPayloadSchema` on receipt, plus a second-stage anti-cheat gate (server-side, intentionally not in this repo) for plausibility checks — impossible burn, future dates, oversize backfills, etc. The gate's rejection codes are part of the public wire contract and typed as `ScanRejectReason` in [`packages/core/src/responses.ts`](../../packages/core/src/responses.ts).

## Verify locally

```bash
npx vibeking inspect-upload
```

Prints the exact payload — same function, same arguments as `vibeking publish`. See [PRIVACY.md](./PRIVACY.md) for more on this guarantee.
