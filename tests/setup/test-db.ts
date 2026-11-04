import { loadEnvConfig } from "@next/env";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Client, Pool } from "pg";

import { getDatabaseConfig } from "../../src/db/config";
import { ownerEmailSetting } from "../../src/db/owner-email";

const TEST_SUFFIX = "_test";

// Tests drop and rebuild databases, so every such step first proves the name ends with
// "_test": the working database can never be touched by mistake.
export function assertTestDatabaseName(name: string) {
  if (!name.endsWith(TEST_SUFFIX) || !/^[A-Za-z0-9_]+$/.test(name)) {
    throw new Error(`Refusing to touch database "${name}": test databases must end with "${TEST_SUFFIX}".`);
  }
}

// The test database lives next to the working one: <POSTGRES_DB>_test, same server and credentials.
export function testDatabaseName() {
  loadEnvConfig(process.cwd());
  const name = getDatabaseConfig().database;
  return name.endsWith(TEST_SUFFIX) ? name : `${name}${TEST_SUFFIX}`;
}

function connectionConfig(database: string) {
  return { ...getDatabaseConfig(), database };
}

// Runs a statement on the server's maintenance database ("postgres"), where databases are managed.
async function withAdminClient<T>(run: (client: Client) => Promise<T>) {
  loadEnvConfig(process.cwd());
  const client = new Client(connectionConfig("postgres"));
  try {
    await client.connect();
  } catch (error) {
    throw new Error("Cannot reach Postgres. Start it first: docker compose up -d --wait", { cause: error });
  }
  try {
    return await run(client);
  } finally {
    await client.end();
  }
}

// Drops the database if it exists and creates an empty one.
export async function recreateDatabase(name: string) {
  assertTestDatabaseName(name);
  await withAdminClient(async (client) => {
    await client.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
    await client.query(`CREATE DATABASE "${name}"`);
  });
}

export async function dropDatabase(name: string) {
  assertTestDatabaseName(name);
  await withAdminClient((client) => client.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`));
}

// The owner of the data that existed before sign-in, in test databases (see drizzle/0005_*.sql).
export const TEST_OWNER_EMAIL = "owner@example.com";

// Applies migrations from a folder the way the server does (`drizzle-kit migrate` calls the same migrator):
// only the ones the database has not seen yet. The owner's email reaches the migrations the way
// drizzle.config.ts passes it, as a connection setting; null leaves it out.
export async function applyMigrations(
  name: string,
  migrationsFolder = "drizzle",
  { ownerEmail = TEST_OWNER_EMAIL }: { ownerEmail?: string | null } = {},
) {
  assertTestDatabaseName(name);
  const options = ownerEmail === null ? undefined : ownerEmailSetting(ownerEmail);
  const pool = new Pool({ ...connectionConfig(name), options });
  try {
    await migrate(drizzle(pool), { migrationsFolder });
  } finally {
    await pool.end();
  }
}

// Runs a callback with a plain connection to a test database.
export async function withTestClient<T>(name: string, run: (client: Client) => Promise<T>) {
  assertTestDatabaseName(name);
  loadEnvConfig(process.cwd());
  const client = new Client(connectionConfig(name));
  await client.connect();
  try {
    return await run(client);
  } finally {
    await client.end();
  }
}
