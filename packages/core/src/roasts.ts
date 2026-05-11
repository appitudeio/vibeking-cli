import type { Score } from "./types.js";

export type RoastInput = Score & {
  totalSessions: number;
  activeDays: number;
  uniqueModels: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  topModel: string | null;
};

type RoastRule = {
  id: string;
  weight: number;
  test: (i: RoastInput) => boolean;
  text: (i: RoastInput) => string;
};

const M = 1_000_000;

const RULES: RoastRule[] = [
  {
    id: "billion",
    weight: 100,
    test: (i) => i.vibeBurn >= 1_000 * M,
    text: (i) =>
      `${fmt(i.vibeBurn)} tokens. you didn't use claude code, you adopted it.`,
  },
  {
    id: "lonely-burn",
    weight: 80,
    test: (i) => i.vibeBurn >= 100 * M && i.activeDays <= 2,
    text: (i) =>
      `${fmt(i.vibeBurn)} tokens across ${i.activeDays} day${i.activeDays === 1 ? "" : "s"}. someone please check on you.`,
  },
  {
    id: "opus-spender",
    weight: 70,
    test: (i) => (i.topModel ?? "").toLowerCase().includes("opus") && i.vibeBurn >= 50 * M,
    text: () => `you used opus like it was someone else's money. (it was.)`,
  },
  {
    id: "cache-goblin",
    weight: 65,
    test: (i) =>
      i.cacheReadTokens > 0 &&
      i.cacheReadTokens >= (i.cacheWriteTokens || 1) * 8,
    text: () =>
      `your cache-read ratio is criminal. you're not coding, you're re-reading.`,
  },
  {
    id: "long-streak",
    weight: 60,
    test: (i) => i.scope === "weekly" ? false : false, // weekly streak handled below
    text: () => "",
  },
  {
    id: "weekly-streak",
    weight: 60,
    test: (i) => i.scope === "weekly" && i.badges.some((b) => b.includes("streak")),
    text: (i) => {
      const streak = parseInt(i.badges.find((b) => b.includes("streak")) ?? "0");
      return `${streak}-day streak. touching grass remains legal in most jurisdictions.`;
    },
  },
  {
    id: "weekend-wonder",
    weight: 55,
    test: (i) => i.badges.includes("one-weekend wonder"),
    text: () =>
      `one-weekend wonder. monday's standup is going to be interesting.`,
  },
  {
    id: "model-omnivore",
    weight: 45,
    test: (i) => i.badges.includes("model omnivore"),
    text: () => `you used three different models. commit to a relationship.`,
  },
  {
    id: "rate-limit-knight",
    weight: 50,
    test: (i) => i.title === "Rate Limit Knight" || i.title === "Rate Limit Royalty",
    text: (i) =>
      `${i.title.toLowerCase()}. you've seen the wall and made it your friend.`,
  },
  {
    id: "vibeking",
    weight: 90,
    test: (i) => i.title === "VibeKing",
    text: () => `vibeking. wear it well — the crown resets sunday.`,
  },
  {
    id: "machine-whisperer",
    weight: 85,
    test: (i) => i.title === "Machine Whisperer",
    text: (i) =>
      `machine whisperer. ${i.flair}. nobody knows what you're cooking but it's cooking.`,
  },
  {
    id: "tourist",
    weight: 30,
    test: (i) => i.title === "Vibe Tourist" && i.vibeBurn < 100_000,
    text: () => `you've barely opened the model. respect, technically.`,
  },
  {
    id: "default-low",
    weight: 10,
    test: (i) => i.vibeBurn < 5 * M,
    text: (i) =>
      `${fmt(i.vibeBurn)} tokens this ${i.scope === "weekly" ? "week" : "month"}. you can do better. or worse. either is fun.`,
  },
  {
    id: "default-mid",
    weight: 10,
    test: (i) => i.vibeBurn < 100 * M,
    text: (i) =>
      `${fmt(i.vibeBurn)} tokens. respectable. concerning. either way, on the board.`,
  },
  {
    id: "default-high",
    weight: 10,
    test: () => true,
    text: (i) =>
      `${fmt(i.vibeBurn)} tokens, ${i.totalSessions} sessions. the model is doing community service.`,
  },
];

export function pickRoast(input: RoastInput): string {
  const matched = RULES.filter((r) => r.test(input)).sort(
    (a, b) => b.weight - a.weight
  );
  for (const r of matched) {
    const text = r.text(input);
    if (text) return text;
  }
  return `${fmt(input.vibeBurn)} tokens. on the board.`;
}

function fmt(n: number): string {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}
