import { sql } from "drizzle-orm";
import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";

import { getDb } from "@/db";
import { proxy } from "@/proxy";

import { sessionCookieOf, signInThroughEmail } from "./setup/auth";
import { DAY_MS, MINUTE_MS, TEST_APP_URL } from "./setup/helpers";

// src/proxy.ts runs before every page: it renews the session on every visit and sends a browser
// without a session to the sign-in page.

const visit = (path: string, headers: Record<string, string> = {}) =>
  proxy(new NextRequest(new URL(path, TEST_APP_URL), { headers }));

const passesThrough = (response: Response) => response.headers.get("x-middleware-next") === "1";
const redirectsTo = (response: Response) => (response.status === 307 ? response.headers.get("location") : null);

async function sessionExpiresAt() {
  const { rows } = await getDb().execute<{ expires_at: Date }>(sql`select expires_at from sessions`);
  return new Date(rows[0].expires_at);
}

describe("proxy", () => {
  it.each([
    ["a page load", {}],
    ["an in-app navigation (RSC: 1)", { RSC: "1" }],
  ])("Заходит регулярно: %s renews a day-old session and its cookie for 30 days", async (_, extra) => {
    const cookie = await signInThroughEmail("anna@example.com");
    await getDb().execute(sql`
      update sessions
      set updated_at = updated_at - interval '1 day 1 minute', expires_at = expires_at - interval '1 day 1 minute'
    `);

    const response = await visit("/contacts/1", { cookie, ...extra });

    expect(passesThrough(response)).toBe(true);
    expect(sessionCookieOf(response.headers)).toBe(cookie);
    const setCookie = response.headers.getSetCookie().find((value) => value.startsWith(cookie));
    expect(setCookie).toMatch(new RegExp(`Max-Age=${30 * 24 * 60 * 60}`, "i"));
    expect(Math.abs((await sessionExpiresAt()).getTime() - (Date.now() + 30 * DAY_MS))).toBeLessThan(MINUTE_MS);
  });

  it("a fresh session passes without being written again", async () => {
    const cookie = await signInThroughEmail("anna@example.com");
    const before = await sessionExpiresAt();

    const response = await visit("/", { cookie });

    expect(passesThrough(response)).toBe(true);
    expect(await sessionExpiresAt()).toEqual(before);
  });

  it("Открыл приложение без входа: no session cookie, the sign-in page", async () => {
    expect(redirectsTo(await visit("/"))).toBe(`${TEST_APP_URL}/login`);
    expect(redirectsTo(await visit("/contacts/1"))).toBe(`${TEST_APP_URL}/login`);
    expect(redirectsTo(await visit("/groups"))).toBe(`${TEST_APP_URL}/login`);
  });

  it("the cookie of a session that has ended (signed out elsewhere) leads to the sign-in page", async () => {
    const cookie = await signInThroughEmail("anna@example.com");
    await getDb().execute(sql`delete from sessions`);

    expect(redirectsTo(await visit("/", { cookie }))).toBe(`${TEST_APP_URL}/login`);
  });

  it.each(["/login", "/login/expired", "/api/auth/magic-link/verify?token=abc", "/api/auth/get-session", "/health"])(
    "%s is open without signing in",
    async (path) => {
      expect(passesThrough(await visit(path))).toBe(true);
    },
  );

  it("a server action without a session goes on: the action itself refuses and sends to the sign-in page", async () => {
    expect(passesThrough(await visit("/", { "next-action": "abc123" }))).toBe(true);
  });

  it("a path that only starts like an open one is not open", async () => {
    expect(redirectsTo(await visit("/login-page"))).toBe(`${TEST_APP_URL}/login`);
    expect(redirectsTo(await visit("/healthy"))).toBe(`${TEST_APP_URL}/login`);
  });
});
