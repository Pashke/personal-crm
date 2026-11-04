import { sql } from "drizzle-orm";
import { describe, expect, it, vi } from "vitest";

import { getDb } from "@/db";

import { SESSION_COOKIE, signInThroughEmail } from "./setup/auth";
import { DAY_MS, MINUTE_MS, redirectTarget } from "./setup/helpers";
import { setRequestHeaders } from "./setup/request";

// The other tests choose the current user themselves (tests/setup/each-file.ts); these check the real
// thing: the user comes from the session cookie of the request, through Better Auth.
const { getCurrentUser, requireUser } = await vi.importActual<typeof import("@/lib/session")>("@/lib/session");

async function sessionExpiresAt() {
  const { rows } = await getDb().execute<{ expires_at: Date }>(sql`select expires_at from sessions`);
  expect(rows).toHaveLength(1);
  return new Date(rows[0].expires_at);
}

// Moves the session into the past, as if every moment of it had happened `days` earlier.
async function ageSession(days: number) {
  await getDb().execute(sql`
    update sessions
    set created_at = created_at - make_interval(days => ${days}),
        updated_at = updated_at - make_interval(days => ${days}),
        expires_at = expires_at - make_interval(days => ${days})
  `);
}

const near = (date: Date, expected: number) => Math.abs(date.getTime() - expected) < MINUTE_MS;

describe("who is signed in", () => {
  it("the user of the session cookie, with the address as the server keeps it", async () => {
    setRequestHeaders({ cookie: await signInThroughEmail(" Anna@Example.COM ") });

    expect(await getCurrentUser()).toEqual({ id: expect.any(String), email: "anna@example.com" });
    expect(await requireUser()).toEqual(await getCurrentUser());
  });

  it("nobody without a session cookie, or with a forged one", async () => {
    await signInThroughEmail("anna@example.com");

    expect(await getCurrentUser()).toBeNull();
    setRequestHeaders({ cookie: `${SESSION_COOKIE}=forged.value` });
    expect(await getCurrentUser()).toBeNull();
  });

  it("requireUser without signing in sends to the sign-in page", async () => {
    expect(await redirectTarget(() => requireUser())).toBe("/login");
  });

  it("Заходит регулярно: a visit on day 20 renews the session, on day 45 the user is still in", async () => {
    setRequestHeaders({ cookie: await signInThroughEmail("anna@example.com") });

    // Day 20: the session would end on day 30, the visit moves the end 30 days from now.
    await ageSession(20);
    expect(await getCurrentUser()).not.toBeNull();
    expect(near(await sessionExpiresAt(), Date.now() + 30 * DAY_MS)).toBe(true);

    // Day 45: 25 days after that visit.
    await ageSession(25);
    expect(await getCurrentUser()).toEqual({ id: expect.any(String), email: "anna@example.com" });
  });

  it("Не заходил 30 дней: the session is over, the sign-in page opens", async () => {
    setRequestHeaders({ cookie: await signInThroughEmail("anna@example.com") });

    await ageSession(30);

    expect(await getCurrentUser()).toBeNull();
    expect(await redirectTarget(() => requireUser())).toBe("/login");
  });
});
