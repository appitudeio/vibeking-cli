# Contributing

The VibeKing CLI is open source so users can trust the scanner. Contributions that improve trust, support more tools, or sharpen the joke are very welcome. Some are easier to merge than others.

## Welcome with open arms

- **New scanners** — Cursor, Windsurf, Codex, Aider, Continue, anything else with a local session archive. Add a new module alongside [`src/scanner.ts`](./src/scanner.ts), wire it up to the upload payload. The `source` enum in [`src/core/redaction.ts`](./src/core/redaction.ts) needs to grow to match.
- **UX polish** — better terminal output, clearer error messages, faster scans, smaller payloads.
- **Privacy hardening** — anything that tightens redaction or makes inspection easier. Tests under [`src/core/__tests__/redaction.test.ts`](./src/core/__tests__/redaction.test.ts) are the right place to add adversarial cases.
- **Docs** — fix anything stale or unclear here, in [PRIVACY.md](./PRIVACY.md), or [PAYLOAD.md](./PAYLOAD.md).

## Needs more conversation

- **Anything that changes the upload payload shape.** The wire format is the contract with the server; changing it touches [`src/core/redaction.ts`](./src/core/redaction.ts), the redaction tests, the fixture-based snapshot test, [PAYLOAD.md](./PAYLOAD.md), and the server. Open an issue first.
- **Reveal output changes.** The offline reveal is intentionally a fact panel with a publish CTA — not a leaderboard card. Anything that adds a score, level, rank, badges, or roast to the CLI conflicts with the trust-layer boundary; that work belongs server-side.

## Won't merge

- **Anything that increases what gets uploaded** without a corresponding update to [PAYLOAD.md](./PAYLOAD.md), [PRIVACY.md](./PRIVACY.md), and the redaction tests. The trust line is the whole product.
- **Telemetry / analytics / "anonymous usage stats"** — no. The whole point is that the only thing the CLI sends is what you explicitly publish.
- **Auto-update logic** — npm handles that. The CLI does not phone home on its own.
- **Anything that requires opening files outside `~/.claude/projects/`** — the read scope is narrow by design.
- **Scoring formula / official rank / leaderboard logic** — those live server-side. The CLI is the trust layer (scanner + consent), not the game.

## Workflow

```bash
pnpm install
pnpm dev          # CLI in dev (scans your real ~/.claude data)
pnpm test
pnpm typecheck
pnpm lint
```

PRs should:

- include tests for new logic (Vitest)
- pass `pnpm typecheck` and `pnpm lint`
- not add new prod dependencies without a justification line in the PR description
- not bundle multiple unrelated changes — one PR per concern

## License

By contributing, you agree your contributions are licensed under MIT (matching the project [LICENSE](./LICENSE)).
