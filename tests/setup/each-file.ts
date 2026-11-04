import { loadEnvConfig } from "@next/env";
import { sql } from "drizzle-orm";
import type { Pool } from "pg";
import { afterAll, beforeEach, vi } from "vitest";

import { getDb } from "@/db";

import { setUserA, USER_A_EMAIL } from "./current-user";
import { createUser } from "./factories";
import { TEST_APP_URL } from "./helpers";
import { resetMailTrap } from "./mail-trap";
import { resetRequest } from "./request";
import { assertTestDatabaseName, testDatabaseName } from "./test-db";

// From here on the app code (getDb) talks to the test database, and Better Auth builds
// sign-in links to TEST_APP_URL whatever .env says.
loadEnvConfig(process.cwd());
process.env.POSTGRES_DB = testDatabaseName();
process.env.BETTER_AUTH_URL = TEST_APP_URL;

// Some Next.js calls work only inside a request, so tests run without them:
// server actions refresh pages (revalidatePath), every read waits for a request (connection),
// and the request's headers come from tests/setup/request.ts.
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  connection: async () => {},
}));
vi.mock("next/headers", () => import("./request"));

// Emails are caught instead of sent (tests/setup/mail-trap.ts).
vi.mock("@/lib/mail", () => import("./mail-trap"));

// The test decides who is signed in (tests/setup/current-user.ts).
vi.mock("@/lib/session", () => import("./current-user"));

// Every test starts from empty tables (ids start from 1 again) and creates what it needs:
// only user A exists, and A is signed in.
beforeEach(async () => {
  resetMailTrap();
  resetRequest();
  await emptyTables();
  setUserA(await createUser(USER_A_EMAIL));
});

async function emptyTables() {
  const db = getDb();
  const { rows: current } = await db.execute<{ name: string }>(sql`select current_database() as name`);
  assertTestDatabaseName(current[0].name);

  const { rows: tables } = await db.execute<{ tablename: string }>(
    sql`select tablename from pg_tables where schemaname = 'public'`,
  );
  if (tables.length > 0) {
    const list = tables.map((table) => `"${table.tablename}"`).join(", ");
    await db.execute(sql.raw(`TRUNCATE ${list} RESTART IDENTITY CASCADE`));
  }
}

// Close the connection pool, or the process would wait for it after the last test.
afterAll(async () => {
  const holder = globalThis as unknown as { db?: { $client: Pool } };
  await holder.db?.$client.end();
  delete holder.db;
});
