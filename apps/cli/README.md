# VibeKing CLI

**The CLI is open source because it scans local Claude Code usage.**

It never uploads prompts, code, file paths, repo names, project names, or transcript content. Run `vibeking inspect-upload` to see the exact JSON before publishing.

See [PRIVACY.md](./PRIVACY.md) for the full data list and [PAYLOAD.md](./PAYLOAD.md) for the schema.

---

## Use it

```bash
npx vibeking
```

That's the whole thing. Scans `~/.claude/projects/*/memory.jsonl`, scores you, hands you a title.

```
       __||__
       \\____//
        ('o')
       (\___/)
        \___/

   VibeKing   weekly scan complete

  ───────────────────────────────────────────────────────────

  VibeBurn        2.04B tokens
  VibeScore       11,685
  Level           8

  Title
   Rate Limit Royalty   anthropic dms you on holidays

  Sessions        100
  Active days     7
  Main weapon     claude-opus-4-7 (79%)

  Badges
    ✓ 7-day streak
    ✓ cache goblin
    ✓ model omnivore
    ✓ 100 sessions
    ✓ billion-token club
```

Want to claim a public rank? `vibeking login` + `vibeking publish`.

## Commands

```
npx vibeking                 scan + reveal + write local card
npx vibeking scan            same
npx vibeking scan --monthly  30-day scope
npx vibeking scan --all      all-time scope
npx vibeking inspect-upload  print the exact JSON that publish would send
npx vibeking login           GitHub OAuth, saves a token at ~/.vibeking/config.json
npx vibeking publish         upload aggregates, claim your rank
npx vibeking whoami          current identity
npx vibeking leagues         leagues you're in (with weekly rank)
npx vibeking create-league <name>      private league + invite url
npx vibeking join <slug> [--code XXX]  join a league
npx vibeking leave <slug>    leave a league
npx vibeking help
```

## Configure where it points

By default the CLI talks to `https://api.vibeking.io` and links to `https://vibeking.io`. Override either:

```bash
# point at a local dev stack
VIBEKING_API_URL=http://localhost:7100 VIBEKING_WEB_URL=http://localhost:5173 vibeking publish

# point at your own fork
VIBEKING_API_URL=https://your-api.example.com vibeking publish
```

## What gets uploaded

Aggregate counts only. Never your prompts, code, file paths, repo names, project names, or transcript content. The single function that builds the payload lives at [`src/util/buildPayload.ts`](./src/util/buildPayload.ts) — both `publish` and `inspect-upload` call it, so they can't drift.

```ts
{
  schemaVersion: 1,
  source: "claude_code",
  cliVersion: "x.y.z",
  scannedAt: "2026-05-11T10:30:00.000Z",
  daily: [
    {
      date: "YYYY-MM-DD",
      inputTokens: number,
      outputTokens: number,
      cacheReadTokens: number,
      cacheWriteTokens: number,
      sessions: number,
      modelBreakdown: { "claude-opus-4-7": number, ... }
    },
    ...
  ]
}
```

`buildUploadPayload` (in [`@vibeking/core`](../../packages/core/src/redaction.ts)) parses the result through a `.strict()` Zod schema — any unknown key throws before send. The redaction tests cover prompt/path-shaped leaks specifically.

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md). New scanners (Cursor, Windsurf, Codex, …) and new badges are the most welcome additions. Scoring weight changes need data backing them up.

## License

MIT — see [LICENSE](./LICENSE).
