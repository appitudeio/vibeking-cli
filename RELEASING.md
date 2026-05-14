# Releasing

`vibeking` publishes to npm as the **unscoped** package `vibeking`, so
users run `npx vibeking`. Releases are automated by
[`.github/workflows/release.yml`](./.github/workflows/release.yml):
bump the version in `package.json`, merge to `main`, and CI verifies +
publishes with a signed provenance attestation, then tags + cuts a
GitHub Release. Tokenless — no npm secret is stored anywhere.

## One-time bootstrap

A brand-new package name can't have a trusted publisher attached until
the package exists (chicken/egg). So the **first** publish is manual;
every release after is automated.

1. **Repo must be public.** `npm publish --provenance` is rejected from
   private repos — provenance is public verifiability. (Also: the whole
   product pitch is "audit the scanner yourself"; a private repo 404s
   for users.)
   ```bash
   gh repo edit appitudeio/vibeking-cli \
     --visibility public --accept-visibility-change-consequences
   ```

2. **First publish, manual**, from a maintainer's machine logged in to
   an npm account that will own `vibeking`:
   ```bash
   npm login
   npm publish        # prepublishOnly runs `pnpm build && pnpm test`
   ```
   This claims the unscoped name and creates the package. No provenance
   on this one publish — that's expected; every automated release after
   is provenance-signed.

3. **Attach the trusted publisher.** npmjs.com → the `vibeking` package
   → *Settings → Trusted Publisher* → GitHub Actions:
   - Organization / repo: `appitudeio/vibeking-cli`
   - Workflow filename: `release.yml`

4. **Repo Settings → Actions → General → Workflow permissions →
   "Read and write permissions"** so the workflow can push the tag and
   create the GitHub Release.

## Cutting a release (every time after bootstrap)

```bash
npm version patch        # 0.1.0 → 0.1.1 (also creates a commit)
#   or: npm version minor / npm version major
git push                 # open a PR, merge to main
```

On merge, `release.yml`:

1. reads `version` from `package.json`
2. **skips** if the tag `v<version>` already exists (so a `package.json`
   change *without* a version bump is a safe no-op)
3. runs `pnpm lint && pnpm typecheck && pnpm test && pnpm build`
4. `npm publish --provenance --access public` — tokenless via the
   trusted publisher; npm shows a "Built and signed on GitHub Actions"
   badge linking the exact commit
5. creates the `v<version>` git tag + a GitHub Release with notes
   generated from the commits since the last tag

`vibeking --version` and the registry can never disagree:
[`src/version.ts`](./src/version.ts) reads the version from
`package.json` at runtime — `package.json` is the single source of
truth.

## Verifying a published release

```bash
npm view vibeking version            # registry version
npx vibeking@latest --version        # what users get
npm view vibeking --json | jq .dist  # provenance / integrity
```

The "Provenance" section on the npmjs.com package page links the
GitHub Actions run and the source commit — the cryptographic chain
from published tarball back to public source.

## Manual publish (fallback if automation breaks)

```bash
npm version patch
npm publish --provenance --access public   # needs npm >= 11.5 + npm login
git push --follow-tags
```

## Optional: migrating to a dedicated `vibeking` GitHub org

The repo lives at `appitudeio/vibeking-cli`. Moving it under a
`github.com/vibeking/*` org is **optional and post-launch** — the
GitHub URL is infra, not product branding. If you do it:

1. Create the `vibeking` GitHub org, transfer the repo into it.
2. Update the repo path in: `package.json` (`repository.url`,
   `bugs.url`), `README.md` footer, `src/commands/help.ts` (the
   `source` line), and the trusted-publisher note in `release.yml`.
3. **Re-point the npm trusted publisher** to the new `org/repo` —
   it's pinned to the exact path; a transfer breaks tokenless
   publishing until reconfigured on npmjs.com.
