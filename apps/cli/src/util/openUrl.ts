import { spawn } from "node:child_process";

/**
 * Launch the given URL in the user's default browser. Returns once the
 * platform launcher has been spawned successfully; the launcher itself
 * is detached and we don't wait for the browser to actually render.
 *
 * Callers should treat failures as non-fatal (the user can always paste
 * the URL manually) — wrap in try/catch like `login.ts` does.
 */
export function openUrl(url: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const { command, args, options } = launcherFor(url);
    const child = spawn(command, args, options);
    child.once("error", reject);
    child.once("spawn", () => {
      child.unref();
      resolve();
    });
  });
}

function launcherFor(url: string): {
  command: string;
  args: string[];
  options: Parameters<typeof spawn>[2];
} {
  const base = { detached: true, stdio: "ignore" as const };
  switch (process.platform) {
    case "darwin":
      return { command: "open", args: [url], options: base };
    case "win32":
      return {
        command: "cmd",
        args: ["/c", "start", "", url],
        options: { ...base, windowsVerbatimArguments: true },
      };
    default:
      return { command: "xdg-open", args: [url], options: base };
  }
}
