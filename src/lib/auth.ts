import "server-only";

import { getDb } from "@/db";
import { createAuth, type Auth } from "@/lib/create-auth";

// One Better Auth per server process, created on first use rather than on import:
// `next build` runs without BETTER_AUTH_SECRET and database credentials.
const globalForAuth = globalThis as unknown as { auth?: Auth; proxyAuth?: Auth };

export function getAuth(): Auth {
  globalForAuth.auth ??= createAuth(getDb());
  return globalForAuth.auth;
}

// For src/proxy.ts only. With Next.js cookies on, Better Auth does not extend the session on
// in-app navigations (requests with the `RSC: 1` header), and the proxy must extend it on every
// page request. The proxy copies the cookies into its response itself.
export function getProxyAuth(): Auth {
  globalForAuth.proxyAuth ??= createAuth(getDb(), { nextCookies: false });
  return globalForAuth.proxyAuth;
}
