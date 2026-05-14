import { readFileSync } from "node:fs";

/**
 * Single source of truth for the version: package.json — the same file
 * npm reads to serve the package, so `vibeking --version` and the
 * registry can never disagree. Resolved relative to this module's URL so
 * it works both from src/ (tsx dev) and the bundled dist/ (published
 * `npx vibeking`) — package.json sits one level above each.
 *
 * No hardcoded fallback: npm always ships package.json in the published
 * tarball regardless of the `files` allowlist, so a missing one means a
 * broken install. Fail loudly rather than report a fake version.
 */
const pkg = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf8")
) as { version: string };

export const CLI_VERSION = pkg.version;
