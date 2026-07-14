import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { env, hasDatabase } from "@/lib/env";
import * as schema from "./schema";

/**
 * Lazy singleton DB connection. postgres.js is suitable for serverless with a
 * small pool; Neon and Vercel Postgres both expose the standard protocol.
 *
 * Returns null when DATABASE_URL is unset. Account and conversation routes
 * return a clear configuration error instead of exposing shared local memory.
 */
let _db: ReturnType<typeof drizzle<typeof schema>> | null = null;

export function getDb() {
  if (!hasDatabase()) return null;
  if (!_db) {
    const client = postgres(env.databaseUrl!, { max: 1, prepare: false });
    _db = drizzle(client, { schema });
  }
  return _db;
}

export { schema };
