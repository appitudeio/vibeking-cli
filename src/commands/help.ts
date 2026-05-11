import pc from "picocolors";
import { CLI_VERSION } from "../version.js";

export function runHelp(): void {
  const c = pc;
  process.stdout.write(
    [
      "",
      `  ${c.bold(c.black(c.bgYellow(" VibeKing ")))}  ${c.dim(`v${CLI_VERSION}`)}`,
      `  ${c.dim("the leaderboard for vibe coders")}`,
      "",
      `  ${c.bold("usage")}`,
      `    npx vibeking                ${c.dim("scan + publish (asks once, then remembers)")}`,
      `    npx vibeking scan           ${c.dim("scan only — no publish prompt")}`,
      `    npx vibeking scan --monthly ${c.dim("scan the last 30 days")}`,
      `    npx vibeking scan --all     ${c.dim("scan all-time data")}`,
      `    npx vibeking login          ${c.dim("github oauth, saves a token")}`,
      `    npx vibeking publish        ${c.dim("upload aggregates and claim your rank")}`,
      `    npx vibeking whoami         ${c.dim("show the user the current token belongs to")}`,
      `    npx vibeking logout         ${c.dim("forget the saved token + auto-publish consent")}`,
      "",
      `    npx vibeking inspect-upload ${c.dim("print the exact payload that would be uploaded")}`,
      `    npx vibeking help           ${c.dim("show this")}`,
      "",
      `  ${c.bold("privacy")}`,
      `    only token counts, dates, model breakdowns ever leave your machine.`,
      `    never: prompts, code, file paths, repo names, transcript content.`,
      `    inspect with: ${c.bold("vibeking inspect-upload")}`,
      "",
      `  ${c.bold("server")}    ${process.env.VIBEKING_API_URL ?? "https://api.vibeking.io"}`,
      `  ${c.bold("docs")}      https://vibeking.io`,
      `  ${c.bold("source")}    https://github.com/appitudeio/vibeking-cli`,
      "",
    ].join("\n") + "\n"
  );
}
