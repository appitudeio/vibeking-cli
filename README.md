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
  vibeking  weekly scan complete

  Tokens         2.04B
  Sessions       100
  Active days    7
  Main weapon    claude-opus-4-7 (79%)

  You have data worth publishing.

  Publish to see your title, rank, roast, card, and leagues:
    vibeking publish
```

The offline CLI shows only facts about your local Claude Code usage. The official title, VibeScore, level, badges, roast, share card, and league standings are computed server-side and shown after `vibeking publish`. The CLI is intentionally the trust layer (scanner + consent), not the game.

`vibeking login` + `vibeking publish` to claim a public rank at [vibeking.io](https://vibeking.io). League management (create / join / leave / leaderboards) lives on the web.

## Repo layout

```
src/
  index.ts            CLI entry point + arg parser
  scanner.ts          Reads ~/.claude/projects/*/memory.jsonl
  redaction.ts        UploadPayloadSchema — the security gate
  buildPayload.ts     scanner → redaction → upload payload assembly
  config.ts           ~/.vibeking/config.json + auth-state checks
  types.ts            Shared types (Scope, DailyAggregate, ScanSummary)
  reveal.ts           Offline reveal output (facts + publish CTA)
  prompt.ts           y/N readline helper
  openUrl.ts          cross-platform browser launcher
  topModel.ts         pickTopModel from daily aggregates
  version.ts          CLI version constant
  commands/           scan (+ default flow), publish, inspectUpload, help, auth
  __tests__/          redaction, payload-snapshot, prompt tests
test/fixtures/        Synthetic Claude Code data for the payload snapshot test
```

The leaderboard backend, web app, anti-cheat heuristics, and admin tools live in a separate, private repo. PRs against *this* repo can only change CLI / scoring-library code — see [CONTRIBUTING.md](./CONTRIBUTING.md).

## Trust mechanics

The whole pitch hinges on three things:

1. **The scanner is right here.** [`src/scanner.ts`](./src/scanner.ts) is short enough to read in five minutes. It reads `~/.claude/projects/*/memory.jsonl` and pulls: timestamps; model names; token counts; tool-use counts (allowlisted; MCP tools collapsed to a single `mcp` bucket so installed-server names don't leak); stop-reason counts; a 24-bucket local-hour histogram; session start/end timestamps (for duration); file path strings (read locally to count distinct values — only the count ships); Edit/Write content (read locally to count line deltas — only the totals ship); permission-mode toggles; hook event names + exit codes; cwd/gitBranch strings (read locally to count distinct values — only the counts ship); `isSidechain` flags; public-marketplace skill names (`Skill` tool's `input.skill`; user-specific names like `brain:*` collapse to `other`); public-marketplace subagent types (`Task` or `Agent` tool's `input.subagent_type` — Claude Code 1.x / 2.x; same allowlist semantics); and worktree-state / file-history-snapshot record counts. Nothing else.
2. **The payload builder is shared.** [`src/buildPayload.ts`](./src/buildPayload.ts) is the one function that turns local data into something uploadable. Both `vibeking publish` and `vibeking inspect-upload` call it — they cannot drift.
3. **The schema is `strictObject`-enforced.** [`src/redaction.ts`](./src/redaction.ts) defines `UploadPayloadSchema` with Valibot `v.strictObject` — any unknown key throws before the request leaves your machine. The [redaction tests](./src/__tests__/redaction.test.ts) and the [fixture-based payload snapshot](./src/__tests__/upload-payload-snapshot.test.ts) cover prompt/path-shaped leaks and wire-format stability.

## Develop

```bash
pnpm install
pnpm dev    # run the CLI against your real ~/.claude data

pnpm test
pnpm typecheck
pnpm lint
```

To point the CLI at a local dev backend instead of production:

```bash
VIBEKING_API_URL=http://localhost:7100 VIBEKING_WEB_URL=http://localhost:5173 pnpm dev
```

## License

MIT — see [LICENSE](./LICENSE).

---

[appitudeio/vibeking-cli](https://github.com/appitudeio/vibeking-cli) · [vibeking.io](https://vibeking.io)
