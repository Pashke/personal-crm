import { sql } from "drizzle-orm";

import { getDb } from "@/db";

// Health check for the deploy smoke test and the container healthcheck:
// 200 when the app is up and the database answers, 503 otherwise.
export async function GET() {
  try {
    await getDb().execute(sql`select 1`);
    return Response.json({ status: "ok" }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Health check failed: database is unreachable", error);
    return Response.json({ status: "error" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
