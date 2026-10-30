import { loadEnvConfig } from "@next/env";
import { sql } from "drizzle-orm";
import type { Pool } from "pg";
import { afterAll, beforeEach, vi } from "vitest";

import { getDb } from "@/db";

import { assertTestDatabaseName, testDatabaseName } from "./test-db";

// From here on the app code (getDb) talks to the test database.
loadEnvConfig(process.cwd());
process.env.POSTGRES_DB = testDatabaseName();

// Two Next.js calls work only inside a request, so tests run without them:
// server actions refresh pages (revalidatePath), and every read waits for a request (connection).
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/server", () => ({ connection: async () => {} }));

// Every test starts from empty tables (ids start from 1 again) and creates what it needs.
beforeEach(async () => {
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
});

// Close the connection pool, or the process would wait for it after the last test.
afterAll(async () => {
  const holder = globalThis as unknown as { db?: { $client: Pool } };
  await holder.db?.$client.end();
  delete holder.db;
});
