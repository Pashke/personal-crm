// Stands in for next/headers in tests (see each-file.ts): the headers of "the current request"
// that server actions and pages read. Better Auth reads the session cookie from them.

let current = new Headers();

export function setRequestHeaders(headers: HeadersInit) {
  current = new Headers(headers);
}

export function resetRequest() {
  current = new Headers();
}

export async function headers() {
  return current;
}

// Server actions may set cookies (Better Auth does it through Next.js); tests do not need them.
export async function cookies() {
  return {
    get: () => undefined,
    getAll: () => [],
    has: () => false,
    set: () => {},
    delete: () => {},
  };
}
