import { cookies } from "next/headers";
import { GUEST_COMPLETE_COOKIE, guestCookieOptions } from "@/lib/auth";

/** Marks the browser's complimentary completed research run. This is invoked
 * only after the client receives a finished response, never when a request starts. */
export async function POST() {
  (await cookies()).set(GUEST_COMPLETE_COOKIE, "1", guestCookieOptions());
  return Response.json({ ok: true });
}
