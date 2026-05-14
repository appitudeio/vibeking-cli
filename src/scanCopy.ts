/**
 * Rotating status lines shown while the scan runs. Ordered loosely by
 * what the scanner is actually doing — concrete-first, then progressively
 * cocky. Shared by `scan` and `inspect-upload` / `publish` so the vibe
 * stays consistent across commands.
 *
 * Lives in its own module so the generic spinner primitive in
 * src/spinner.ts stays free of product copy.
 */
export const SCAN_STATUS_LINES = [
  "scanning ~/.claude/projects",
  "counting tool calls",
  "tallying tokens",
  "reading the receipts",
  "weighing the burn",
] as const;
