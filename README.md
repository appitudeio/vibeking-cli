# VibeKing

**The CLI is open source because it scans local Claude Code usage.**

It never uploads prompts, code, file paths, repo names, project names, or transcript content. Run `vibeking inspect-upload` to see the exact JSON before publishing.

See [PRIVACY.md](./PRIVACY.md) for the full data list and [PAYLOAD.md](./PAYLOAD.md) for the schema.

---

## Try it

```bash
npx vibeking
```

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

`vibeking login` + `vibeking publish` to claim a public rank at [vibeking.io](https://vibeking.io).

## Repo layout

```
apps/
  cli/        Node CLI published as `vibeking` on npm
packages/
  core/       Pure-TS scoring formula, redaction, payload schema (@vibeking/core on npm)
  tsconfig/   Shared TS base config
```

The leaderboard backend, web app, anti-cheat heuristics, and admin tools live in a separate, private repo. PRs against *this* repo can only change CLI / scoring-library code — see [CONTRIBUTING.md](./CONTRIBUTING.md).

## Trust mechanics

The whole pitch hinges on three things:

1. **The scanner is right here.** [`apps/cli/src/scanners/claudeCode.ts`](./apps/cli/src/scanners/claudeCode.ts) is short enough to read in five minutes. It reads `~/.claude/projects/*/memory.jsonl`, pulls timestamps + model names + token counts, and that's it.
2. **The payload builder is shared.** [`apps/cli/src/util/buildPayload.ts`](./apps/cli/src/util/buildPayload.ts) is the one function that turns local data into something uploadable. Both `vibeking publish` and `vibeking inspect-upload` call it — they cannot drift.
3. **The schema is `.strict()`-enforced.** [`packages/core/src/redaction.ts`](./packages/core/src/redaction.ts) defines `UploadPayloadSchema` with Zod `.strict()` — any unknown key throws before the request leaves your machine. The [redaction tests](./packages/core/src/__tests__/redaction.test.ts) cover prompt/path-shaped leaks specifically.

## Develop

```bash
pnpm install
pnpm --filter vibeking dev    # run the CLI against your real ~/.claude data

pnpm test
pnpm typecheck
pnpm lint
```

To point the CLI at a local dev backend instead of production:

```bash
VIBEKING_API_URL=http://localhost:7100 VIBEKING_WEB_URL=http://localhost:5173 pnpm --filter vibeking dev
```

## License

MIT — see [LICENSE](./LICENSE).

---

[appitudeio/vibeking-cli](https://github.com/appitudeio/vibeking-cli) · [vibeking.io](https://vibeking.io)
