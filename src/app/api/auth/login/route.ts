import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { createSession, isAuthConfigured, SESSION_COOKIE, sessionCookieOptions } from "@/lib/auth";
import { getDb, schema } from "@/lib/db";

export async function POST(request: Request) {
  if (!isAuthConfigured()) return Response.json({ error: "Meridian requires DATABASE_URL before accounts can be enabled." }, { status: 503 });
  const body = await request.json().catch(() => null) as { email?: unknown; password?: unknown } | null;
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body?.password === "string" ? body.password : "";
  if (!email || !password) return Response.json({ error: "Email and password are required." }, { status: 400 });

  const db = getDb()!;
  const [user] = await db.select().from(schema.users).where(eq(schema.users.email, email)).limit(1);
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) return Response.json({ error: "That email and password do not match." }, { status: 401 });

  const token = await createSession(user.id);
  const response = Response.json({ user: { id: user.id, email: user.email } });
  response.headers.append("Set-Cookie", `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${sessionCookieOptions().maxAge}${process.env.NODE_ENV === "production" ? "; Secure" : ""}`);
  return response;
}
