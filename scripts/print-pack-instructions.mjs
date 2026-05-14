#!/usr/bin/env node
import { readdirSync } from "node:fs";
import { join } from "node:path";

const dir = "/tmp/vibeking-pack";
const tarball = readdirSync(dir)
  .filter((f) => f.endsWith(".tgz"))
  .sort()
  .at(-1);

if (!tarball) {
  console.error(`no .tgz found in ${dir}`);
  process.exit(1);
}

const path = join(dir, tarball);

console.log("");
console.log(`  tarball: ${path}`);
console.log("");
console.log("  run it (production backend):");
console.log(`    npx --package=${path} vibeking`);
console.log("");
console.log("  run it (local backend at :7100 + :5173):");
console.log(
  `    VIBEKING_API_URL=http://localhost:7100 VIBEKING_WEB_URL=http://localhost:5173 \\`,
);
console.log(`      npx --package=${path} vibeking`);
console.log("");
console.log("  any subcommand (publish/login/help/inspect-upload/...):");
console.log(`    npx --package=${path} vibeking help`);
console.log("");
console.log("  npx caches tarballs — re-run pack:test after every code change.");
console.log("");
