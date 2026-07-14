import { cookies } from "next/headers";
import { deleteSession, SESSION_COOKIE, sessionCookieOptions } from "@/lib/auth";

export async function POST() {
  const store = await cookies();
  await deleteSession(store.get(SESSION_COOKIE)?.value);
  store.set(SESSION_COOKIE, "", { ...sessionCookieOptions(), maxAge: 0 });
  return Response.json({ ok: true });
}
