import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { createSession, isAuthConfigured, provisionCompanyMembership, SESSION_COOKIE, sessionCookieOptions } from "@/lib/auth";
import { getDb, schema } from "@/lib/db";

function credentials(value: unknown) {
  if (!value || typeof value !== "object") return null;
  const { email, password } = value as { email?: unknown; password?: unknown };
  if (typeof email !== "string" || typeof password !== "string") return null;
  const normalizedEmail = email.trim().toLowerCase();
  if (!/^\S+@\S+\.\S+$/.test(normalizedEmail) || normalizedEmail.length > 320 || password.length < 10 || password.length > 128) return null;
  return { email: normalizedEmail, password };
}

export async function POST(request: Request) {
  if (!isAuthConfigured()) return Response.json({ error: "Meridian requires DATABASE_URL before accounts can be enabled." }, { status: 503 });
  const input = credentials(await request.json().catch(() => null));
  if (!input) return Response.json({ error: "Use a valid email and a password of at least 10 characters." }, { status: 400 });

  const db = getDb()!;
  const [existing] = await db.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.email, input.email)).limit(1);
  if (existing) return Response.json({ error: "An account already exists for that email. Sign in instead." }, { status: 409 });

  const id = nanoid(16);
  await db.insert(schema.users).values({ id, email: input.email, passwordHash: await bcrypt.hash(input.password, 12) });
  await provisionCompanyMembership(id);
  const token = await createSession(id);
  const response = Response.json({ user: { id, email: input.email } }, { status: 201 });
  response.headers.append("Set-Cookie", `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${sessionCookieOptions().maxAge}${process.env.NODE_ENV === "production" ? "; Secure" : ""}`);
  return response;
}
