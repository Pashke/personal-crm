import "server-only";

import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import { getDatabaseConfig } from "./config";
import * as schema from "./schema";

type Db = NodePgDatabase<typeof schema>;

// One connection pool per server process, created on first use rather than on import:
// `next build` loads this module without database credentials (they exist only on the server).
// Kept on globalThis so hot reloads in development reuse it instead of opening new connections.
const globalForDb = globalThis as unknown as { db?: Db };

export function getDb(): Db {
  globalForDb.db ??= drizzle(new Pool(getDatabaseConfig()), { schema });
  return globalForDb.db;
}
