import { applyMigrations, recreateDatabase, testDatabaseName } from "./test-db";

// Once per run: a fresh test database with every migration from drizzle/ applied.
export default async function setup() {
  const name = testDatabaseName();
  await recreateDatabase(name);
  await applyMigrations(name);
}
