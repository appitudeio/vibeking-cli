import pc from "picocolors";

const FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"] as const;
const PENDING_BULLET = "○";

/**
 * Multi-line install-style progress. Renders one row per message from
 * the start — past rows carry ✓, the current row spins, future rows
 * show a `○` placeholder so the user can see what's coming. Repaints in
 * place via ANSI cursor-up so the block stays anchored.
 *
 * On `stop()`, all rows are committed with ✓ (so a fast scan still ends
 * on a satisfying complete list). No-ops in non-TTY environments.
 *
 * A single-element message argument behaves like a plain one-line spinner.
 */
export function startSpinner(message: string | readonly string[]): () => void {
  if (!process.stderr.isTTY) return () => {};

  const messages: readonly string[] =
    typeof message === "string" ? [message] : message;
  if (messages.length === 0) return () => {};

  let frame = 0;
  let msgIndex = 0;
  let stopped = false;
  let painted = false;
  let frameTimer: ReturnType<typeof setInterval> | null = null;
  let msgTimer: ReturnType<typeof setInterval> | null = null;

  process.stderr.write("\x1b[?25l"); // hide cursor

  const exitHandler = (): void => {
    try {
      process.stderr.write("\x1b[?25h");
    } catch {
      // stream gone
    }
  };
  process.once("exit", exitHandler);

  // Repaint the whole block. `markAllDone` is used at stop time to flip
  // every row to ✓ regardless of msgIndex — a fast scan that didn't
  // advance through every row still ends on a complete list.
  const paint = (markAllDone = false): void => {
    if (painted) process.stderr.write(`\x1b[${messages.length}A`);
    for (let i = 0; i < messages.length; i++) {
      let bullet: string;
      if (markAllDone || i < msgIndex) bullet = pc.green("✓");
      else if (i === msgIndex)
        bullet = pc.cyan(FRAMES[frame % FRAMES.length]!);
      else bullet = pc.dim(PENDING_BULLET);
      process.stderr.write(
        `\r\x1b[2K  ${bullet} ${pc.dim(messages[i]!)}\n`
      );
    }
    painted = true;
  };

  // Advance to the next message — hold on the last so long scans don't
  // wrap and look stuck.
  const advance = (): void => {
    if (msgIndex >= messages.length - 1) {
      if (msgTimer) clearInterval(msgTimer);
      msgTimer = null;
      return;
    }
    msgIndex += 1;
    frame = 0;
  };

  const render = (): void => {
    try {
      paint();
      frame = (frame + 1) % FRAMES.length;
    } catch {
      // stderr piped to a closing reader (EPIPE); bail out so the timer
      // doesn't escalate to uncaughtException.
      stop();
    }
  };

  const stop = (): void => {
    if (stopped) return;
    stopped = true;
    if (frameTimer) clearInterval(frameTimer);
    if (msgTimer) clearInterval(msgTimer);
    process.removeListener("exit", exitHandler);
    try {
      paint(true);
      process.stderr.write("\x1b[?25h");
    } catch {
      // stream gone — nothing left to do.
    }
  };

  paint();
  frameTimer = setInterval(render, 80);
  if (messages.length > 1) {
    msgTimer = setInterval(advance, 1800);
  }

  return stop;
}
