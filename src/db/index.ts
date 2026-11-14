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

// When every connection of the pool is busy, a query waits for a free one at most this long and then
// fails: a page shows an error, /health answers 503, and nothing hangs forever.
const CONNECTION_WAIT_MS = 10_000;

export function getDb(): Db {
  globalForDb.db ??= drizzle(new Pool({ ...getDatabaseConfig(), connectionTimeoutMillis: CONNECTION_WAIT_MS }), {
    schema,
  });
  return globalForDb.db;
}
