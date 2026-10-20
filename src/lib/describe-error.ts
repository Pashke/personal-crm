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

// SQLSTATE 23503 foreign_key_violation, e.g. a note for a contact deleted in another tab.
// Drizzle puts the driver error on `cause`, so the whole chain is checked.
export function isForeignKeyViolation(error: unknown) {
  let current = error;
  for (let depth = 0; current instanceof Error && depth < MAX_DEPTH; depth++) {
    if (Reflect.get(current, "code") === "23503") return true;
    current = current.cause;
  }
  return false;
}
