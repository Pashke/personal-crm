// Config for the Better Auth CLI only: it reads the tables Better Auth needs from here and writes
// them to src/db/auth-schema.ts. The settings are the app's own (createAuth); the database is a
// Drizzle instance without a connection, the CLI never queries it.
//
//   pnpm dlx auth@<better-auth version> generate --config scripts/better-auth-cli.ts --output src/db/auth-schema.ts
//
// After generating, put back the edits described at the top of src/db/auth-schema.ts.
import { drizzle } from "drizzle-orm/node-postgres";

import * as schema from "../src/db/schema";
import { createAuth } from "../src/lib/create-auth";

export const auth = createAuth(drizzle.mock({ schema }));
