#!/usr/bin/env node
// Bump the version + commit — WITHOUT creating a local git tag.
// `.github/workflows/release.yml` owns tagging: on push to main it reads
// the new version, and if the tag doesn't exist yet it verifies,
// publishes (tokenless OIDC + provenance), then creates the tag + GitHub
// Release. Creating the tag locally here would make that workflow's
// tag-existence check skip the publish — so we deliberately don't.
//
// Usage:  pnpm release            (patch: 0.1.0 -> 0.1.1)
//         pnpm release minor      (0.1.0 -> 0.2.0)
//         pnpm release major      (0.1.0 -> 1.0.0)
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";

const kind = process.argv[2] ?? "patch";
if (!["patch", "minor", "major"].includes(kind)) {
  console.error(`unknown release kind: ${kind} (use patch | minor | major)`);
  process.exit(1);
}

const run = (cmd) => execSync(cmd, { stdio: "inherit" });

run(`npm version ${kind} --no-git-tag-version`);

const { version } = JSON.parse(readFileSync("package.json", "utf8"));

run(`git add package.json`);
run(`git commit -m "release: v${version}"`);

console.log(
  `\n  bumped to v${version}\n` +
    `  next:  git push origin main\n` +
    `         → release.yml verifies, publishes (provenance), tags v${version},\n` +
    `           and cuts the GitHub Release. Watch: gh run watch\n`
);
