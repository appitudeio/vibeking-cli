/**
 * Compile-time exhaustiveness check. Use in the `default:` branch of a
 * switch over a union type — TypeScript narrows `x` to `never` after
 * the case clauses exhaust the union, so passing anything else (i.e. a
 * union member you forgot to handle) fails to compile.
 */
export function assertNever(x: never): never {
  throw new Error(`assertNever: unhandled value: ${JSON.stringify(x)}`);
}
