import type { AuthUser } from "@/lib/auth";
import { getCurrentUser } from "@/lib/auth";

export class ProspectingError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
    this.name = "ProspectingError";
  }
}
export async function requireProspectingUser(request?: Request): Promise<AuthUser> {
  const user = await getCurrentUser();
  if (!user) throw new ProspectingError("Sign in to use the Prospecting Desk.", 401);
  if (request && request.method !== "GET" && request.method !== "HEAD") {
    const origin = request.headers.get("origin");
    const site = request.headers.get("sec-fetch-site");
    if ((origin && origin !== new URL(request.url).origin) || (site && site !== "same-origin")) {
      throw new ProspectingError("Cross-origin prospecting changes are not allowed.", 403);
    }
  }
  return user;
}

export function prospectingRouteError(error: unknown): Response {
  if (error instanceof ProspectingError) return Response.json({ error: error.message }, { status: error.status });
  if (error instanceof Response) return error;
  console.error("[prospecting] request failed:", error);
  return Response.json({ error: "The Prospecting Desk could not complete this request." }, { status: 500 });
}
