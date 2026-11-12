import { sql } from "drizzle-orm";

import { requestSignInLink } from "@/app/(auth)/login/actions";
import { getDb } from "@/db";
import { getAuth } from "@/lib/auth";

import { formDataOf } from "./helpers";
import { emailsTo } from "./mail-trap";
import { signInLinkOf } from "./mailpit";

// The session cookie as the app names it on an http address (tests run without https), see
// cookiePrefix in src/lib/create-auth.ts.
export const SESSION_COOKIE = "crm.session_token";

// «Получить ссылку» for the address; returns the link from the email it sent.
export async function requestLink(address: string) {
  const state = await requestSignInLink({}, formDataOf({ email: address }));
  if (!state.sentTo) throw new Error(`No email was sent: ${JSON.stringify(state)}`);
  const emails = emailsTo(state.sentTo);
  return signInLinkOf(emails[emails.length - 1]);
}

export type LinkResult = {
  // Where the browser goes next: the path, e.g. "/" or "/login/expired".
  path: string;
  // "name=value" of the session cookie the response sets, if it signs the browser in.
  sessionCookie: string | null;
};

// Opens a sign-in link the way a browser does, through Better Auth's real HTTP handler.
export async function openLink(link: string): Promise<LinkResult> {
  const response = await getAuth().handler(new Request(link));
  const location = response.headers.get("location");
  if (!location) throw new Error(`The link answered ${response.status} without a redirect`);
  return { path: new URL(location).pathname, sessionCookie: sessionCookieOf(response.headers) };
}

// The session cookie set by a response, as "name=value", or null when there is none.
export function sessionCookieOf(headers: Headers) {
  for (const cookie of headers.getSetCookie()) {
    const pair = cookie.split(";")[0];
    if (pair.startsWith(`${SESSION_COOKIE}=`) && pair.length > SESSION_COOKIE.length + 1) return pair;
  }
  return null;
}

// Requests a link for the address and opens it: a browser signed in as that user.
export async function signInThroughEmail(address: string) {
  const result = await openLink(await requestLink(address));
  if (!result.sessionCookie) throw new Error(`The link did not sign in, it led to ${result.path}`);
  return result.sessionCookie;
}

// Moves every sign-in link into the past, as if it had been sent `minutes` ago.
export async function ageSignInLinks(minutes: number) {
  await getDb().execute(sql`
    update verifications
    set created_at = created_at - make_interval(mins => ${minutes}),
        expires_at = expires_at - make_interval(mins => ${minutes})
  `);
}
