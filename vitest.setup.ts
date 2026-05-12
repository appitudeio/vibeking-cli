// Pin the TZ so the local-hour histogram snapshot test is deterministic
// on every entry point — `pnpm test`, `pnpm vitest run`, or invoking
// vitest directly all hit the same buckets. The `TZ=UTC` in package.json's
// test script is kept as belt-and-suspenders for environments that load
// Date before vitest setup runs.
process.env.TZ = "UTC";
