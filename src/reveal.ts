import pc from "picocolors";

export type RevealInput = {
  sessions: number;
  activeDays: number;
  topModel: string | null;
  topModelShare: number;
};

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Drip-reveal the scan facts after the spinner finishes. Each line
 * appears with a brief pause so the receipts feel earned — not a wall
 * of text dumped at once. In non-TTY environments (CI, piped stdout)
 * we skip the delays and write the same text synchronously.
 */
export async function animateReveal(i: RevealInput): Promise<void> {
  const animate = process.stdout.isTTY === true;
  const pause = (ms: number): Promise<void> =>
    animate ? sleep(ms) : Promise.resolve();

  process.stdout.write("\n");
  await pause(700);

  process.stdout.write(
    `  ${pc.green("✓")} ${pc.bold("Vibe calculation done")}\n`
  );
  await pause(1000);

  process.stdout.write("\n");
  process.stdout.write(
    `  ${pc.dim("Sessions")}       ${i.sessions.toLocaleString()}\n`
  );
  await pause(400);
  process.stdout.write(`  ${pc.dim("Active days")}    ${i.activeDays}\n`);
  await pause(400);
  if (i.topModel) {
    process.stdout.write(
      `  ${pc.dim("Main weapon")}    ${i.topModel} ${pc.dim(`(${Math.round(i.topModelShare * 100)}%)`)}\n`
    );
    await pause(600);
  }
  // Trailing blank line so whatever prints next (publish spinner, consent
  // prompt, etc.) has breathing room. No trailing pause — the spinner
  // takes over from here.
  process.stdout.write("\n");
}

export function renderEmptyState(reason: string): string {
  return [
    "",
    `  ${pc.bold("vibeking")}  ${pc.dim("scan inconclusive")}`,
    "",
    `  ${pc.red("✕")} ${reason}`,
    "",
    `  ${pc.dim("Run a Claude Code session, then try again.")}`,
    "",
  ].join("\n");
}
