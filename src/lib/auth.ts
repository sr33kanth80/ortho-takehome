import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { and, asc, eq, gt, inArray, sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import { getDb, schema } from "@/lib/db";
import { env } from "@/lib/env";

const DEFAULT_COMPANY_ID = "meridian-default";

export const SESSION_COOKIE = "meridian_session";
export const GUEST_COMPLETE_COOKIE = "meridian_guest_run_complete";
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

export interface AuthUser {
  id: string;
  email: string;
  companyId: string;
  companyName: string;
  role: "manager" | "employee";
  dynamicExecutionEnabled: boolean;
}

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  };
}

export function guestCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  };
}

export async function hasUsedGuestRun() {
  return (await cookies()).get(GUEST_COMPLETE_COOKIE)?.value === "1";
}

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function isAuthConfigured() {
  return Boolean(getDb());
}

export async function createSession(userId: string): Promise<string> {
  const db = getDb();
  if (!db) throw new Error("DATABASE_URL is required to create an account.");
  const token = randomBytes(32).toString("base64url");
  await db.insert(schema.sessions).values({
    id: nanoid(16),
    userId,
    tokenHash: hashToken(token),
    expiresAt: new Date(Date.now() + SESSION_MAX_AGE_SECONDS * 1000),
  });
  return token;
}

export async function deleteSession(token: string | undefined): Promise<void> {
  const db = getDb();
  if (!db || !token) return;
  await db.delete(schema.sessions).where(eq(schema.sessions.tokenHash, hashToken(token)));
}

export async function getCurrentUser(): Promise<AuthUser | null> {
  const db = getDb();
  if (!db) return null;
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const [row] = await db
    .select({
      id: schema.users.id,
      email: schema.users.email,
      companyId: schema.companyMemberships.companyId,
      companyName: schema.companies.name,
      role: schema.companyMemberships.role,
      dynamicExecutionEnabled: schema.companyMemberships.dynamicExecutionEnabled,
    })
    .from(schema.sessions)
    .innerJoin(schema.users, eq(schema.sessions.userId, schema.users.id))
    .innerJoin(schema.companyMemberships, eq(schema.companyMemberships.userId, schema.users.id))
    .innerJoin(schema.companies, eq(schema.companies.id, schema.companyMemberships.companyId))
    .where(and(
      eq(schema.sessions.tokenHash, hashToken(token)),
      gt(schema.sessions.expiresAt, new Date()),
      eq(schema.companyMemberships.status, "active"),
      eq(schema.companies.status, "active"),
    ))
    .limit(1);
  if (!row) return null;
  return { ...row, role: row.role === "admin" || row.role === "manager" ? "manager" : "employee" };
}

/**
 * Provision the single-company membership used by this deployment. The company
 * row is locked so two simultaneous first registrations cannot both become
 * managers. Later identity/SSO integrations can call the same membership layer.
 */
export async function provisionCompanyMembership(userId: string): Promise<void> {
  const db = getDb();
  if (!db) throw new Error("DATABASE_URL is required to provision company access.");
  await db.transaction(async (tx) => {
    let [company] = await tx.select({ id: schema.companies.id }).from(schema.companies).where(eq(schema.companies.status, "active")).orderBy(asc(schema.companies.createdAt)).limit(1);
    if (!company) {
      [company] = await tx.insert(schema.companies).values({ id: DEFAULT_COMPANY_ID, name: env.company.name, status: "active" }).returning({ id: schema.companies.id });
    }
    await tx.insert(schema.companyDynamicSettings).values({ companyId: company.id }).onConflictDoNothing();
    await tx.execute(sql`SELECT id FROM companies WHERE id = ${company.id} FOR UPDATE`);
    const [manager] = await tx
      .select({ id: schema.companyMemberships.id })
      .from(schema.companyMemberships)
      .where(and(eq(schema.companyMemberships.companyId, company.id), inArray(schema.companyMemberships.role, ["manager", "admin"])))
      .limit(1);
    await tx.insert(schema.companyMemberships).values({
      id: nanoid(16),
      companyId: company.id,
      userId,
      role: manager ? "employee" : "manager",
      status: "active",
    }).onConflictDoNothing();
  });
}

export async function requireManager(): Promise<AuthUser> {
  const user = await getCurrentUser();
  if (!user) throw new Response("Sign in required", { status: 401 });
  if (user.role !== "manager") throw new Response("Manager access required", { status: 403 });
  return user;
}
