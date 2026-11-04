import { defineConfig, devices } from "@playwright/test";

import { testDatabaseName } from "./tests/setup/test-db";

const port = 3100;
const baseURL = `http://127.0.0.1:${port}`;

// testDatabaseName() loads .env. The app runs in production mode, where Better Auth needs its secret.
const databaseName = testDatabaseName();
for (const name of ["BETTER_AUTH_SECRET", "SMTP_URL"]) {
  if (!process.env[name]) throw new Error(`${name} is not set: add it to .env (see README)`);
}

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
  // never to the working one, and sending emails to the mail stub (SMTP_URL). Sign-in links lead
  // to this port.
  webServer: {
    command: `pnpm tsx e2e/prepare-db.ts && pnpm build && pnpm start --port ${port}`,
    url: `${baseURL}/health`,
    timeout: 240_000,
    reuseExistingServer: false,
    env: { POSTGRES_DB: databaseName, BETTER_AUTH_URL: baseURL },
  },
});
