// Bound arguments of server actions come back from the browser, so they are checked like any other input.
export function isValidId(id: unknown): id is number {
  return typeof id === "number" && Number.isInteger(id) && id > 0;
}

// An id from text (an address segment, a query parameter, a form value): only plain digits
// that fit a Postgres integer. Anything else is not an id.
export function parseId(raw: string): number | null {
  if (!/^\d{1,9}$/.test(raw)) return null;
  const id = Number(raw);
  return id > 0 ? id : null;
}
