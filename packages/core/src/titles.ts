export type TitleInput = {
  vibeBurn: number;
  vibeScore: number;
  streakDays: number;
  activeDays: number;
  uniqueModels: number;
  sessions: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
};

export type TitleResult = {
  title: string;
  flair: string;
  badges: string[];
};

const M = 1_000_000;

type Tier = {
  min: number;
  title: string;
  flair: string;
};

const TIERS: Tier[] = [
  { min: 0,        title: "Vibe Tourist",          flair: "just looking around" },
  { min: 250_000,  title: "Prompt Apprentice",     flair: "warming up the model" },
  { min: 1 * M,    title: "Context Packer",        flair: "stuffing the window" },
  { min: 5 * M,    title: "Token Enjoyer",         flair: "the spice is flowing" },
  { min: 15 * M,   title: "Agent Wrangler",        flair: "you and the machine, partners" },
  { min: 35 * M,   title: "Prompt Gremlin",        flair: "feral but functional" },
  { min: 75 * M,   title: "Context Menace",        flair: "feared by autocompletes" },
  { min: 150 * M,  title: "Token Degen",           flair: "fully tokenpilled" },
  { min: 300 * M,  title: "Rate Limit Knight",     flair: "you have seen the wall" },
  { min: 600 * M,  title: "Vibe Lord",             flair: "the vibes obey you" },
  { min: 1_000 * M,title: "Rate Limit Royalty",    flair: "anthropic dms you on holidays" },
  { min: 2_500 * M,title: "VibeKing",              flair: "uneasy lies the head" },
];

export function getTitle(input: TitleInput): TitleResult {
  const tier = pickTier(input.vibeBurn);

  // Streak-driven overrides take precedence — long streaks are rarer than burn.
  let title = tier.title;
  let flair = tier.flair;

  if (input.streakDays >= 30 && input.vibeBurn >= 50 * M) {
    title = "Machine Whisperer";
    flair = "30 days uninterrupted, no notes";
  } else if (input.streakDays >= 14 && input.vibeBurn >= 100 * M) {
    title = "VibeKing";
    flair = "two straight weeks of dominance";
  }

  return {
    title,
    flair,
    badges: collectBadges(input),
  };
}

function pickTier(burn: number): Tier {
  let chosen = TIERS[0]!;
  for (const t of TIERS) {
    if (burn >= t.min) chosen = t;
  }
  return chosen;
}

function collectBadges(i: TitleInput): string[] {
  const out: string[] = [];
  if (i.streakDays >= 7) out.push(`${i.streakDays}-day streak`);
  if (i.cacheReadTokens > 0 && i.cacheReadTokens >= i.cacheWriteTokens * 5) {
    out.push("cache goblin");
  }
  if (i.uniqueModels >= 3) out.push("model omnivore");
  if (i.sessions >= 50) out.push(`${i.sessions} sessions`);
  if (i.vibeBurn >= 100 * M && i.activeDays <= 2) out.push("one-weekend wonder");
  if (i.vibeBurn >= 1_000 * M) out.push("billion-token club");
  return out;
}
