import { redirect } from "next/navigation";

import type { CurrentUser } from "@/lib/session";

// Stands in for src/lib/session.ts in tests (see each-file.ts): the test decides who is signed in.
// Before every test user A is created and signed in, so a test about one user needs nothing more.
// session.test.ts checks the real thing: the user from the session cookie.

export const USER_A_EMAIL = "user-a@example.com";

let defaultUser: CurrentUser | null = null;
let current: CurrentUser | null = null;

// User A of the current test: the owner of whatever the factories create unless told otherwise.
export function userA(): CurrentUser {
  if (!defaultUser) throw new Error("User A is created before each test (tests/setup/each-file.ts)");
  return defaultUser;
}

export function setUserA(user: CurrentUser) {
  defaultUser = { id: user.id, email: user.email };
  current = defaultUser;
}

// From now on server actions and pages see this user; null is "not signed in".
export function signInAs(user: CurrentUser | null) {
  current = user ? { id: user.id, email: user.email } : null;
}

export async function getCurrentUser() {
  return current;
}

export async function requireUser() {
  if (!current) redirect("/login");
  return current;
}
