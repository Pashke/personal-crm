import { applyMigrations, recreateDatabase, testDatabaseName } from "../tests/setup/test-db";

// Runs before the app starts (see webServer in playwright.config.ts), so nothing is connected
// to the database while it is dropped: a fresh test database with every migration applied.
async function main() {
  const name = testDatabaseName();
  await recreateDatabase(name);
  await applyMigrations(name);
}

main().catch((error) => {
  console.error("Failed to prepare the test database", error);
  process.exit(1);
});
