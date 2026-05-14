import { createInterface } from "node:readline/promises";

/**
 * Ask a y/N question on stdin. Returns the default when stdin isn't a TTY
 * (CI, piped input) so callers don't hang. Default is `false` unless the
 * caller passes `{ default: true }`.
 */
export async function confirm(
  question: string,
  opts: { default?: boolean } = {}
): Promise<boolean> {
  const defaultYes = opts.default ?? false;
  if (!process.stdin.isTTY) return defaultYes;

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const suffix = defaultYes ? "(Y/n)" : "(y/N)";
    const answer = (await rl.question(`${question} ${suffix} `)).trim().toLowerCase();
    if (!answer) return defaultYes;
    return answer === "y" || answer === "yes";
  } finally {
    rl.close();
  }
}
