import { z } from "zod";

// ────────────────────────────────────────────────────────────
// API response DTOs — shared between the API (which produces them)
// and the web client (which validates + consumes them).
// Adding a field here requires updating the route handler AND the
// web client. The compiler enforces the second; this schema enforces
// the wire format.
// ────────────────────────────────────────────────────────────

export const ScoreScopeSchema = z.enum(["weekly", "monthly", "all_time"]);
export type ScoreScope = z.infer<typeof ScoreScopeSchema>;

export const ScoreSnapshotDtoSchema = z.object({
  scope: ScoreScopeSchema,
  vibeBurn: z.number().int().nonnegative(),
  vibeScore: z.number().int().nonnegative(),
  level: z.number().int().positive(),
  title: z.string(),
  flair: z.string(),
  badges: z.array(z.string()),
  costUsd: z.number().nonnegative(),
  scoringVersion: z.string(),
  calculatedAt: z.string(),
});
export type ScoreSnapshotDto = z.infer<typeof ScoreSnapshotDtoSchema>;

export const PublicUserDtoSchema = z.object({
  handle: z.string(),
  displayName: z.string(),
  avatarUrl: z.string().nullable(),
  country: z.string().nullable(),
  city: z.string().nullable(),
});
export type PublicUserDto = z.infer<typeof PublicUserDtoSchema>;

export const ProfileResponseSchema = z.object({
  ok: z.literal(true),
  user: PublicUserDtoSchema,
  scores: z.array(ScoreSnapshotDtoSchema),
});
export type ProfileResponse = z.infer<typeof ProfileResponseSchema>;

export const LeaderboardEntryDtoSchema = z.object({
  rank: z.number().int().positive(),
  // Non-null: the API filters out users who haven't picked a handle.
  handle: z.string(),
  displayName: z.string(),
  avatarUrl: z.string().nullable(),
  country: z.string().nullable(),
  vibeBurn: z.number().int().nonnegative(),
  vibeScore: z.number().int().nonnegative(),
  level: z.number().int().positive(),
  title: z.string(),
  flair: z.string(),
  badges: z.array(z.string()),
  streakDays: z.number().int().nonnegative(),
  /** 0–1 fraction: how much of the burn happened on weekends. */
  noLifeIndex: z.number().min(0).max(1),
});
export type LeaderboardEntryDto = z.infer<typeof LeaderboardEntryDtoSchema>;

export const LeaderboardResponseSchema = z.object({
  ok: z.literal(true),
  scope: ScoreScopeSchema,
  total: z.number().int().nonnegative(),
  entries: z.array(LeaderboardEntryDtoSchema),
});
export type LeaderboardResponse = z.infer<typeof LeaderboardResponseSchema>;

export const WhoamiResponseSchema = z.object({
  ok: z.literal(true),
  authMethod: z.enum(["session", "cli_token"]),
  user: z.object({
    id: z.string(),
    handle: z.string().nullable(),
    name: z.string(),
    country: z.string().nullable(),
  }),
});
export type WhoamiResponse = z.infer<typeof WhoamiResponseSchema>;

export const ScanAcceptedResponseSchema = z.object({
  ok: z.literal(true),
  stored: z.boolean(),
  acceptedDays: z.number().int().nonnegative(),
  scope: ScoreScopeSchema,
  score: z.object({
    vibeBurn: z.number().int().nonnegative(),
    vibeScore: z.number().int().nonnegative(),
    level: z.number().int().positive(),
    title: z.string(),
    flair: z.string(),
    badges: z.array(z.string()),
  }),
});
export type ScanAcceptedResponse = z.infer<typeof ScanAcceptedResponseSchema>;

// Closed set of reasons a /scan submission can be rejected at the gate.
// Mirrors heuristics.ts RejectReason["code"] — keep both in sync.
export const ScanRejectReasonSchema = z.enum([
  "future_date",
  "ancient_date",
  "impossible_burn",
  "cumulative_burn_too_high",
  "backfill_too_long",
  "malformed_payload",
]);
export type ScanRejectReason = z.infer<typeof ScanRejectReasonSchema>;

export const ScanRejectedResponseSchema = z.object({
  ok: z.literal(false),
  error: z.literal("invalid_payload"),
  reason: ScanRejectReasonSchema,
  detail: z.string(),
  date: z.string().optional(),
});
export type ScanRejectedResponse = z.infer<typeof ScanRejectedResponseSchema>;

export const ScanRateLimitedResponseSchema = z.object({
  ok: z.literal(false),
  error: z.literal("rate_limited"),
  retryAfterSeconds: z.number().int().nonnegative(),
});
export type ScanRateLimitedResponse = z.infer<
  typeof ScanRateLimitedResponseSchema
>;

// ────────────────────────────────────────────────────────────
// Leagues (Phase 4)
// ────────────────────────────────────────────────────────────

// v1 only ships country + private; global is implicit (=overall leaderboard).
// tool/creator/city stay in the DB enum for forward-compat but aren't exposed
// on the wire until later phases.
export const LeagueTypeSchema = z.enum(["country", "private"]);
export type LeagueType = z.infer<typeof LeagueTypeSchema>;

export const LeagueVisibilitySchema = z.enum([
  "public",
  "unlisted",
  "private",
]);
export type LeagueVisibility = z.infer<typeof LeagueVisibilitySchema>;

export const LeagueDtoSchema = z.object({
  slug: z.string(),
  name: z.string(),
  type: LeagueTypeSchema,
  visibility: LeagueVisibilitySchema,
  memberCount: z.number().int().nonnegative(),
  // null for country leagues (no owner) and any other ownerless league.
  ownerHandle: z.string().nullable(),
  isOwner: z.boolean(),
  isMember: z.boolean(),
  createdAt: z.string(),
});
export type LeagueDto = z.infer<typeof LeagueDtoSchema>;

export const LeagueResponseSchema = z.object({
  ok: z.literal(true),
  league: LeagueDtoSchema,
});
export type LeagueResponse = z.infer<typeof LeagueResponseSchema>;

export const LeagueLeaderboardResponseSchema = z.object({
  ok: z.literal(true),
  league: LeagueDtoSchema,
  scope: ScoreScopeSchema,
  entries: z.array(LeaderboardEntryDtoSchema),
});
export type LeagueLeaderboardResponse = z.infer<
  typeof LeagueLeaderboardResponseSchema
>;

// MyLeagues embeds the user's own weekly rank in each league (avoiding N+1
// fetches from the CLI / dashboard).
export const MyLeagueDtoSchema = LeagueDtoSchema.extend({
  myWeeklyRank: z.number().int().positive().nullable(),
});
export type MyLeagueDto = z.infer<typeof MyLeagueDtoSchema>;

export const MyLeaguesResponseSchema = z.object({
  ok: z.literal(true),
  leagues: z.array(MyLeagueDtoSchema),
});
export type MyLeaguesResponse = z.infer<typeof MyLeaguesResponseSchema>;

// Name allows letters (Unicode), digits, spaces, dots, dashes, underscores,
// apostrophes — enough for any culture's casual name; rejects HTML / quotes /
// other prompt-injection vectors.
const LEAGUE_NAME_REGEX = /^[\p{L}\p{N}\p{Z}.\-_']+$/u;

export const CreateLeagueRequestSchema = z
  .object({
    name: z.string().min(3).max(40).regex(LEAGUE_NAME_REGEX, {
      message:
        "league name must be 3–40 letters, digits, spaces, or .-_' characters",
    }),
  })
  .strict();
export type CreateLeagueRequest = z.infer<typeof CreateLeagueRequestSchema>;

export const CreateLeagueResponseSchema = z.object({
  ok: z.literal(true),
  league: LeagueDtoSchema,
  inviteCode: z.string(),
  inviteUrl: z.string(),
});
export type CreateLeagueResponse = z.infer<typeof CreateLeagueResponseSchema>;

export const JoinLeagueRequestSchema = z
  .object({
    code: z.string().min(1).max(40).optional(),
  })
  .strict();
export type JoinLeagueRequest = z.infer<typeof JoinLeagueRequestSchema>;
