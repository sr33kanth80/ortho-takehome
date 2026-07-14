import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { and, eq, gt } from "drizzle-orm";
import { nanoid } from "nanoid";
import { getDb, schema } from "@/lib/db";

export const SESSION_COOKIE = "meridian_session";
export const GUEST_COMPLETE_COOKIE = "meridian_guest_run_complete";
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

export interface AuthUser {
  id: string;
  email: string;
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
    .select({ id: schema.users.id, email: schema.users.email })
    .from(schema.sessions)
    .innerJoin(schema.users, eq(schema.sessions.userId, schema.users.id))
    .where(and(eq(schema.sessions.tokenHash, hashToken(token)), gt(schema.sessions.expiresAt, new Date())))
    .limit(1);
  return row ?? null;
}
