#!/usr/bin/env node
import { runScan } from "./commands/scan.js";
import { runInspectUpload } from "./commands/inspectUpload.js";
import { runHelp } from "./commands/help.js";
import { runLogin, runLogout, runWhoami } from "./commands/auth.js";
import { runPublish } from "./commands/publish.js";
import {
  runCreateLeague,
  runJoinLeague,
  runLeaveLeague,
  runListLeagues,
} from "./commands/leagues.js";

type Command =
  | "scan"
  | "inspect-upload"
  | "help"
  | "login"
  | "logout"
  | "whoami"
  | "publish"
  | "create-league"
  | "join"
  | "leagues"
  | "leave";

type ParsedArgs = {
  command: Command;
  scope: "weekly" | "monthly" | "all_time";
  open: boolean;
  positional: string[];
  code?: string;
};

function parseArgs(argv: string[]): ParsedArgs {
  const args = argv.slice(2);
  let command: Command = "scan";
  let scope: "weekly" | "monthly" | "all_time" = "weekly";

  const first = args[0];
  if (first && !first.startsWith("-")) {
    if (first === "scan") command = "scan";
    else if (first === "inspect-upload" || first === "inspect") command = "inspect-upload";
    else if (first === "help" || first === "--help" || first === "-h") command = "help";
    else if (first === "login") command = "login";
    else if (first === "logout") command = "logout";
    else if (first === "whoami") command = "whoami";
    else if (first === "publish") command = "publish";
    else if (first === "create-league") command = "create-league";
    else if (first === "join") command = "join";
    else if (first === "leagues") command = "leagues";
    else if (first === "leave") command = "leave";
    else command = "scan";
  } else if (args.includes("--help") || args.includes("-h")) {
    command = "help";
  }

  if (args.includes("--monthly")) scope = "monthly";
  if (args.includes("--all") || args.includes("--all-time")) scope = "all_time";
  const open = !args.includes("--no-open");

  const positional = args.slice(1).filter((a) => !a.startsWith("-"));
  const codeIdx = args.indexOf("--code");
  const code = codeIdx >= 0 ? args[codeIdx + 1] : undefined;

  return { command, scope, open, positional, code };
}

async function main(): Promise<void> {
  const { command, scope, open, positional, code } = parseArgs(process.argv);

  switch (command) {
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
    case "create-league":
      await runCreateLeague(positional.join(" ").trim() || undefined);
      return;
    case "join":
      await runJoinLeague(positional[0], code);
      return;
    case "leagues":
      await runListLeagues();
      return;
    case "leave":
      await runLeaveLeague(positional[0]);
      return;
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.stack : err);
  process.exit(1);
});
