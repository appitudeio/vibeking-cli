#!/usr/bin/env node
import { runDefault, runScan } from "./commands/scan.js";
import { runInspectUpload } from "./commands/inspectUpload.js";
import { runHelp } from "./commands/help.js";
import { runLogin, runLogout, runWhoami } from "./commands/auth.js";
import { runPublish } from "./commands/publish.js";
import type { Scope } from "./core/types.js";

type Command =
  | "default"
  | "scan"
  | "inspect-upload"
  | "help"
  | "login"
  | "logout"
  | "whoami"
  | "publish";

type ParsedArgs = {
  command: Command;
  scope: Scope;
  open: boolean;
};

function parseArgs(argv: string[]): ParsedArgs {
  const args = argv.slice(2);
  let command: Command = "default";
  let scope: Scope = "weekly";

  const first = args[0];
  if (first && !first.startsWith("-")) {
    if (first === "scan") command = "scan";
    else if (first === "inspect-upload" || first === "inspect") command = "inspect-upload";
    else if (first === "help" || first === "--help" || first === "-h") command = "help";
    else if (first === "login") command = "login";
    else if (first === "logout") command = "logout";
    else if (first === "whoami") command = "whoami";
    else if (first === "publish") command = "publish";
    else command = "default";
  } else if (args.includes("--help") || args.includes("-h")) {
    command = "help";
  }

  if (args.includes("--monthly")) scope = "monthly";
  if (args.includes("--all") || args.includes("--all-time")) scope = "all_time";
  const open = !args.includes("--no-open");

  return { command, scope, open };
}

async function main(): Promise<void> {
  const { command, scope, open } = parseArgs(process.argv);

  switch (command) {
    case "default":
      await runDefault({ scope, open });
      return;
    case "scan":
      await runScan({ scope });
      return;
    case "inspect-upload":
      await runInspectUpload();
      return;
    case "help":
      runHelp();
      return;
    case "login":
      await runLogin({ open });
      return;
    case "logout":
      await runLogout();
      return;
    case "whoami":
      await runWhoami();
      return;
    case "publish":
      await runPublish();
      return;
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.stack : err);
  process.exit(1);
});
