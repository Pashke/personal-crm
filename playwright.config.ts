import { defineConfig, devices } from "@playwright/test";

import { testDatabaseName } from "./tests/setup/test-db";

const port = 3100;
const baseURL = `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: "e2e",
  // Every test starts from the same tables in one shared database, so tests run one by one.
  workers: 1,
  fullyParallel: false,
  use: {
    baseURL,
    locale: "ru-RU",
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  // The real production build on a separate port, talking to the test database (<POSTGRES_DB>_test),
  // never to the working one. testDatabaseName() above has already loaded the connection settings.
  webServer: {
    command: `pnpm tsx e2e/prepare-db.ts && pnpm build && pnpm start --port ${port}`,
    url: `${baseURL}/health`,
    timeout: 240_000,
    reuseExistingServer: false,
    env: { POSTGRES_DB: testDatabaseName() },
  },
});
