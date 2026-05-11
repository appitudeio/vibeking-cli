import pc from "picocolors";
import { clearAuth } from "../util/config.js";

export async function runLogout(): Promise<void> {
  const c = pc;
  await clearAuth();
  process.stdout.write(
    `\n  ${c.green("✓")} ${c.bold("logged out")}  ${c.dim("(token removed)")}\n\n`
  );
}
