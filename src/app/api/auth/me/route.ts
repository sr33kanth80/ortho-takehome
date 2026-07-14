import { getCurrentUser, isAuthConfigured } from "@/lib/auth";

export async function GET() {
  return Response.json({ user: await getCurrentUser(), configured: isAuthConfigured() });
}
