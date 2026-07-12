import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { env, hasDatabase } from "@/lib/env";
import * as schema from "./schema";

/**
 * Lazy singleton DB connection (postgres.js works well on serverless with
 * small pools; Neon/Vercel Postgres both speak the postgres protocol).
 * Returns null when DATABASE_URL is unset — callers fall back to ephemeral
 * mode so the app remains usable without a database.
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
