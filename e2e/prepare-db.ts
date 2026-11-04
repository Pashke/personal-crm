import { applyMigrations, recreateDatabase, TEST_OWNER_EMAIL, testDatabaseName } from "../tests/setup/test-db";

// Runs before the app starts (see webServer in playwright.config.ts), so nothing is connected
// to the database while it is dropped: a fresh test database with every migration applied.
// Even a fresh database has data (the five default groups), so the migrations need an owner.
async function main() {
  const name = testDatabaseName();
  await recreateDatabase(name);
  await applyMigrations(name, "drizzle", { ownerEmail: TEST_OWNER_EMAIL });
}

main().catch((error) => {
  console.error("Failed to prepare the test database", error);
  process.exit(1);
});
