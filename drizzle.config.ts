import { loadEnvConfig } from "@next/env";
import { defineConfig } from "drizzle-kit";

import { getDatabaseConfig } from "./src/db/config";
import { ownerEmailSetting } from "./src/db/owner-email";

loadEnvConfig(process.cwd());

// The owner of the data that existed before sign-in, for migration 0005: OWNER_EMAIL becomes the
// connection setting crm.owner_email. The pg driver takes PGOPTIONS from the environment.
// A wrong address stops here, before the database is touched.
const ownerSetting = ownerEmailSetting(process.env.OWNER_EMAIL);
if (ownerSetting) {
  process.env.PGOPTIONS = [process.env.PGOPTIONS, ownerSetting].filter(Boolean).join(" ");
}

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: getDatabaseConfig(),
});
