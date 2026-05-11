import * as v from "valibot";

// ────────────────────────────────────────────────────────────
// API response DTOs — shared between the API (which produces them)
// and the web client (which validates + consumes them).
// Adding a field here requires updating the route handler AND the
// web client. The compiler enforces the second; this schema enforces
// the wire format.
// ────────────────────────────────────────────────────────────

export const ScoreScopeSchema = v.picklist(["weekly", "monthly", "all_time"]);
export type ScoreScope = v.InferOutput<typeof ScoreScopeSchema>;

export const ScoreSnapshotDtoSchema = v.object({
  scope: ScoreScopeSchema,
  vibeBurn: v.pipe(v.number(), v.integer(), v.minValue(0)),
  vibeScore: v.pipe(v.number(), v.integer(), v.minValue(0)),
  level: v.pipe(v.number(), v.integer(), v.minValue(1)),
  title: v.string(),
  flair: v.string(),
  badges: v.array(v.string()),
  costUsd: v.pipe(v.number(), v.minValue(0)),
  scoringVersion: v.string(),
  calculatedAt: v.string(),
});
export type ScoreSnapshotDto = v.InferOutput<typeof ScoreSnapshotDtoSchema>;

export const PublicUserDtoSchema = v.object({
  handle: v.string(),
  displayName: v.string(),
  avatarUrl: v.nullable(v.string()),
  country: v.nullable(v.string()),
  city: v.nullable(v.string()),
});
export type PublicUserDto = v.InferOutput<typeof PublicUserDtoSchema>;

export const ProfileResponseSchema = v.object({
  ok: v.literal(true),
  user: PublicUserDtoSchema,
  scores: v.array(ScoreSnapshotDtoSchema),
});
export type ProfileResponse = v.InferOutput<typeof ProfileResponseSchema>;

export const LeaderboardEntryDtoSchema = v.object({
  rank: v.pipe(v.number(), v.integer(), v.minValue(1)),
  // Non-null: the API filters out users who haven't picked a handle.
  handle: v.string(),
  displayName: v.string(),
  avatarUrl: v.nullable(v.string()),
  country: v.nullable(v.string()),
  vibeBurn: v.pipe(v.number(), v.integer(), v.minValue(0)),
  vibeScore: v.pipe(v.number(), v.integer(), v.minValue(0)),
  level: v.pipe(v.number(), v.integer(), v.minValue(1)),
  title: v.string(),
  flair: v.string(),
  badges: v.array(v.string()),
  streakDays: v.pipe(v.number(), v.integer(), v.minValue(0)),
  /** 0–1 fraction: how much of the burn happened on weekends. */
  noLifeIndex: v.pipe(v.number(), v.minValue(0), v.maxValue(1)),
});
export type LeaderboardEntryDto = v.InferOutput<typeof LeaderboardEntryDtoSchema>;

export const LeaderboardResponseSchema = v.object({
  ok: v.literal(true),
  scope: ScoreScopeSchema,
  total: v.pipe(v.number(), v.integer(), v.minValue(0)),
  entries: v.array(LeaderboardEntryDtoSchema),
});
export type LeaderboardResponse = v.InferOutput<typeof LeaderboardResponseSchema>;

export const WhoamiResponseSchema = v.object({
  ok: v.literal(true),
  authMethod: v.picklist(["session", "cli_token"]),
  user: v.object({
    id: v.string(),
    handle: v.nullable(v.string()),
    name: v.string(),
    country: v.nullable(v.string()),
  }),
});
export type WhoamiResponse = v.InferOutput<typeof WhoamiResponseSchema>;

export const ScanAcceptedResponseSchema = v.object({
  ok: v.literal(true),
  stored: v.boolean(),
  acceptedDays: v.pipe(v.number(), v.integer(), v.minValue(0)),
  scope: ScoreScopeSchema,
  score: v.object({
    vibeBurn: v.pipe(v.number(), v.integer(), v.minValue(0)),
    vibeScore: v.pipe(v.number(), v.integer(), v.minValue(0)),
    level: v.pipe(v.number(), v.integer(), v.minValue(1)),
    title: v.string(),
    flair: v.string(),
    badges: v.array(v.string()),
  }),
});
export type ScanAcceptedResponse = v.InferOutput<typeof ScanAcceptedResponseSchema>;

// Closed set of reasons a /scan submission can be rejected at the gate.
// Mirrors heuristics.ts RejectReason["code"] — keep both in sync.
export const ScanRejectReasonSchema = v.picklist([
  "future_date",
  "ancient_date",
  "impossible_burn",
  "cumulative_burn_too_high",
  "backfill_too_long",
  "malformed_payload",
]);
export type ScanRejectReason = v.InferOutput<typeof ScanRejectReasonSchema>;

export const ScanRejectedResponseSchema = v.object({
  ok: v.literal(false),
  error: v.literal("invalid_payload"),
  reason: ScanRejectReasonSchema,
  detail: v.string(),
  date: v.optional(v.string()),
});
export type ScanRejectedResponse = v.InferOutput<typeof ScanRejectedResponseSchema>;

export const ScanRateLimitedResponseSchema = v.object({
  ok: v.literal(false),
  error: v.literal("rate_limited"),
  retryAfterSeconds: v.pipe(v.number(), v.integer(), v.minValue(0)),
});
export type ScanRateLimitedResponse = v.InferOutput<
  typeof ScanRateLimitedResponseSchema
>;

// ────────────────────────────────────────────────────────────
// Leagues (Phase 4)
// ────────────────────────────────────────────────────────────

// v1 only ships country + private; global is implicit (=overall leaderboard).
// tool/creator/city stay in the DB enum for forward-compat but aren't exposed
// on the wire until later phases.
export const LeagueTypeSchema = v.picklist(["country", "private"]);
export type LeagueType = v.InferOutput<typeof LeagueTypeSchema>;

export const LeagueVisibilitySchema = v.picklist([
  "public",
  "unlisted",
  "private",
]);
export type LeagueVisibility = v.InferOutput<typeof LeagueVisibilitySchema>;

export const LeagueDtoSchema = v.object({
  slug: v.string(),
  name: v.string(),
  type: LeagueTypeSchema,
  visibility: LeagueVisibilitySchema,
  memberCount: v.pipe(v.number(), v.integer(), v.minValue(0)),
  // null for country leagues (no owner) and any other ownerless league.
  ownerHandle: v.nullable(v.string()),
  isOwner: v.boolean(),
  isMember: v.boolean(),
  createdAt: v.string(),
});
export type LeagueDto = v.InferOutput<typeof LeagueDtoSchema>;

export const LeagueResponseSchema = v.object({
  ok: v.literal(true),
  league: LeagueDtoSchema,
});
export type LeagueResponse = v.InferOutput<typeof LeagueResponseSchema>;

export const LeagueLeaderboardResponseSchema = v.object({
  ok: v.literal(true),
  league: LeagueDtoSchema,
  scope: ScoreScopeSchema,
  entries: v.array(LeaderboardEntryDtoSchema),
});
export type LeagueLeaderboardResponse = v.InferOutput<
  typeof LeagueLeaderboardResponseSchema
>;

// MyLeagues embeds the user's own weekly rank in each league (avoiding N+1
// fetches from the CLI / dashboard).
export const MyLeagueDtoSchema = v.object({
  ...LeagueDtoSchema.entries,
  myWeeklyRank: v.nullable(v.pipe(v.number(), v.integer(), v.minValue(1))),
});
export type MyLeagueDto = v.InferOutput<typeof MyLeagueDtoSchema>;

export const MyLeaguesResponseSchema = v.object({
  ok: v.literal(true),
  leagues: v.array(MyLeagueDtoSchema),
});
export type MyLeaguesResponse = v.InferOutput<typeof MyLeaguesResponseSchema>;

// Name allows letters (Unicode), digits, spaces, dots, dashes, underscores,
// apostrophes — enough for any culture's casual name; rejects HTML / quotes /
// other prompt-injection vectors.
const LEAGUE_NAME_REGEX = /^[\p{L}\p{N}\p{Z}.\-_']+$/u;

export const CreateLeagueRequestSchema = v.strictObject({
  name: v.pipe(
    v.string(),
    v.minLength(3),
    v.maxLength(40),
    v.regex(
      LEAGUE_NAME_REGEX,
      "league name must be 3–40 letters, digits, spaces, or .-_' characters"
    )
  ),
});
export type CreateLeagueRequest = v.InferOutput<typeof CreateLeagueRequestSchema>;

export const CreateLeagueResponseSchema = v.object({
  ok: v.literal(true),
  league: LeagueDtoSchema,
  inviteCode: v.string(),
  inviteUrl: v.string(),
});
export type CreateLeagueResponse = v.InferOutput<typeof CreateLeagueResponseSchema>;

export const JoinLeagueRequestSchema = v.strictObject({
  code: v.optional(v.pipe(v.string(), v.minLength(1), v.maxLength(40))),
});
export type JoinLeagueRequest = v.InferOutput<typeof JoinLeagueRequestSchema>;
