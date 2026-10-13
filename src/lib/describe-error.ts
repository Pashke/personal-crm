import "server-only";

// Database errors carry the submitted values: Drizzle puts the query parameters into the
// message and `params`, Postgres puts the offending row into `detail`. Logs must not hold
// names, phones, emails or note text, so only technical identifiers are kept.
const SAFE_FIELDS = ["code", "constraint", "table", "column"] as const;
const MAX_DEPTH = 5;

export function describeError(error: unknown) {
  const chain: Record<string, string>[] = [];
  let current = error;
  while (current instanceof Error && chain.length < MAX_DEPTH) {
    const entry: Record<string, string> = { name: current.name };
    for (const field of SAFE_FIELDS) {
      const value: unknown = Reflect.get(current, field);
      if (typeof value === "string" || typeof value === "number") entry[field] = String(value);
    }
    chain.push(entry);
    current = current.cause;
  }
  return chain;
}
