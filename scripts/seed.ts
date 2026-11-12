// Fills the database with realistic demo contacts, notes, group memberships and birthdays for the owner:
// the user with the address from OWNER_EMAIL in .env (made a user if they have never signed in).
// Usage: pnpm db:seed. Does nothing if the owner already has contacts, so real data is never mixed
// with demo data. The data itself: scripts/demo-data.ts.
import { loadEnvConfig } from "@next/env";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import { getDatabaseConfig } from "../src/db/config";
import * as schema from "../src/db/schema";

import { seedDemoData } from "./demo-data";

async function main() {
  loadEnvConfig(process.cwd());
  const pool = new Pool(getDatabaseConfig());
  try {
    const result = await seedDemoData(drizzle(pool, { schema }), { ownerEmail: process.env.OWNER_EMAIL });
    if ("skipped" in result) {
      console.log(
        `Skipped: the owner already has ${result.skipped} contacts. Demo data goes only to an owner without contacts.`,
      );
    } else {
      console.log(
        `Seeded ${result.contacts} contacts, ${result.notes} notes and ${result.memberships} group memberships for the owner.`,
      );
    }
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error("Seeding failed:", error);
  process.exit(1);
});
