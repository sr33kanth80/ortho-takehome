import { config } from "dotenv";
import postgres from "postgres";

config({ path: ".env.local" });
config();

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
  const db = postgres(process.env.DATABASE_URL, { max: 1 });
  try {
    const tables = await db.unsafe<{ table_name: string }[]>(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name IN ('companies','company_memberships','company_dynamic_settings','dynamic_api_policies','dynamic_api_executions','governance_audit_events') ORDER BY table_name",
    );
    const members = await db.unsafe<{ role: string; count: number }[]>(
      "SELECT role, count(*)::int AS count FROM company_memberships GROUP BY role ORDER BY role",
    );
    if (tables.length !== 6) {
      const columns = await db.unsafe<{ table_name: string; column_name: string; data_type: string }[]>(
        "SELECT table_name, column_name, data_type FROM information_schema.columns WHERE table_schema = 'public' AND table_name IN ('companies','company_memberships','company_dynamic_settings','dynamic_api_policies','dynamic_api_executions','governance_audit_events') ORDER BY table_name, ordinal_position",
      );
      const companies = await db.unsafe("SELECT id, name, status FROM companies ORDER BY created_at LIMIT 5");
      const existingMembers = await db.unsafe("SELECT company_id, role, status, count(*)::int AS count FROM company_memberships GROUP BY company_id, role, status ORDER BY company_id, role");
      throw new Error(`Expected 6 governance tables; found ${tables.length}: ${tables.map((row) => row.table_name).join(", ")}. Companies: ${JSON.stringify(companies)}. Memberships: ${JSON.stringify(existingMembers)}. Existing columns: ${JSON.stringify(columns)}`);
    }
    if (!members.some((row) => (row.role === "manager" || row.role === "admin") && Number(row.count) > 0)) throw new Error("No manager membership was bootstrapped");
    console.log(JSON.stringify({ governanceTables: tables.map((row) => row.table_name), membershipCounts: members }));
  } finally {
    await db.end();
  }
}

void main();
