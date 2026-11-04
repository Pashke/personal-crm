import { applyMigrations, recreateDatabase, TEST_OWNER_EMAIL, testDatabaseName } from "./test-db";

// Once per run: a fresh test database with every migration from drizzle/ applied.
// Even a fresh database has data (the five default groups), so the migrations need an owner.
export default async function setup() {
  const name = testDatabaseName();
  await recreateDatabase(name);
  await applyMigrations(name, "drizzle", { ownerEmail: TEST_OWNER_EMAIL });
}
