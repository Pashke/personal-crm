import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

const fromRoot = (path: string) => fileURLToPath(new URL(path, import.meta.url));

export default defineConfig({
  resolve: {
    alias: [
      { find: /^@\//, replacement: fromRoot("./src/") },
      // `server-only` throws outside a Next.js server build, tests run in plain Node.
      { find: /^server-only$/, replacement: fromRoot("./tests/setup/empty-module.ts") },
    ],
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    // The test database is rebuilt once per run, then every test file shares it.
    globalSetup: ["tests/setup/global.ts"],
    setupFiles: ["tests/setup/each-file.ts"],
    fileParallelism: false,
  },
});
