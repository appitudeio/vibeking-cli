#!/usr/bin/env node
import { runDefault, runScan } from "./commands/scan.js";
import { runInspectUpload } from "./commands/inspectUpload.js";
import { runHelp } from "./commands/help.js";
import { runLogin, runLogout, runWhoami } from "./commands/auth.js";
import { runPublish } from "./commands/publish.js";
import { runInstallations } from "./commands/installations.js";
import { CLI_VERSION } from "./version.js";
import { assertNever } from "./assertNever.js";
import { stripControlChars } from "./sanitize.js";
import type { Scope } from "./types.js";

type Command =
  | "default"
  | "scan"
  | "inspect-upload"
  | "help"
  | "version"
  | "login"
  | "logout"
  | "whoami"
  | "publish"
  | "installations"
  | "unknown";

type ParsedArgs = {
  command: Command;
  /** Sub-token after the command name — used by multi-verb commands. */
  subcommand: string | undefined;
  /** The raw token that failed to match — only populated for `unknown`. */
  unknownToken: string | undefined;
  scope: Scope;
  open: boolean;
};

const KNOWN_COMMANDS = {
  scan: "scan",
  "inspect-upload": "inspect-upload",
  inspect: "inspect-upload",
  help: "help",
  login: "login",
  logout: "logout",
  whoami: "whoami",
  publish: "publish",
  installations: "installations",
} as const satisfies Record<string, Command>;

function parseArgs(argv: string[]): ParsedArgs {
  const args = argv.slice(2);
  let command: Command = "default";
  let scope: Scope = "weekly";
  let unknownToken: string | undefined;

  // Global flags win over positionals — `vibeking <typo> --version` should
  // print the version, not crash on the typo. Same for --help.
  if (args.includes("--help") || args.includes("-h")) {
    command = "help";
  } else if (args.includes("--version") || args.includes("-v")) {
    command = "version";
  } else {
    const first = args[0];
    if (first && !first.startsWith("-")) {
      const resolved = (KNOWN_COMMANDS as Record<string, Command | undefined>)[
        first
      ];
      if (resolved) {
        command = resolved;
      } else {
        command = "unknown";
        unknownToken = first;
      }
    }
  }

  const subcommand = args[1];

  if (args.includes("--monthly")) scope = "monthly";
  if (args.includes("--all") || args.includes("--all-time")) scope = "all_time";
  const open = !args.includes("--no-open");

  return { command, subcommand, unknownToken, scope, open };
}

async function main(): Promise<void> {
  const { command, subcommand, unknownToken, scope, open } = parseArgs(
    process.argv
  );

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
    case "version":
      process.stdout.write(`vibeking ${CLI_VERSION}\n`);
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
    case "installations":
      await runInstallations(subcommand);
      return;
    case "unknown":
      process.stderr.write(
        `unknown command: ${stripControlChars(unknownToken ?? "")}\n` +
          `Run 'vibeking help' for usage.\n`
      );
      process.exitCode = 1;
      return;
    default:
      assertNever(command);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.stack : err);
  process.exit(1);
});
