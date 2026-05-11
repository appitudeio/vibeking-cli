import kleur from "kleur";
import { CLI_VERSION } from "../version.js";

export function runHelp(): void {
  const c = kleur;
  process.stdout.write(
    [
      "",
      `  ${c.bgYellow().black().bold(" VibeKing ")}  ${c.dim(`v${CLI_VERSION}`)}`,
      `  ${c.dim("the leaderboard for vibe coders")}`,
      "",
      `  ${c.bold("usage")}`,
      `    npx vibeking                ${c.dim("scan + reveal + write local card (default)")}`,
      `    npx vibeking scan           ${c.dim("alias of the default")}`,
      `    npx vibeking scan --monthly ${c.dim("score over the last 30 days")}`,
      `    npx vibeking scan --all     ${c.dim("score over all-time data")}`,
      `    npx vibeking login          ${c.dim("github oauth, saves a token")}`,
      `    npx vibeking publish        ${c.dim("upload aggregates and claim your rank")}`,
      `    npx vibeking whoami         ${c.dim("show the user the current token belongs to")}`,
      `    npx vibeking logout         ${c.dim("forget the saved token")}`,
      "",
      `    npx vibeking leagues        ${c.dim("list leagues you're in (with weekly rank)")}`,
      `    npx vibeking create-league <name>  ${c.dim("private league + invite url")}`,
      `    npx vibeking join <slug> [--code <code>]  ${c.dim("join via invite")}`,
      `    npx vibeking leave <slug>   ${c.dim("leave a league")}`,
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
