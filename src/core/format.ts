/**
 * Compact-burn formatter used on share cards, leaderboards, and the
 * terminal reveal. Kept in core so the three surfaces never drift
 * (e.g., 2.5B vs 2.50B from rounding differences).
 */
export function formatBurn(n: number): string {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(2)}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}
