import { listConversations } from "@/lib/db/store";
import { getCurrentUser } from "@/lib/auth";

/** GET /api/conversations — list recent conversations (empty in ephemeral mode). */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Sign in required" }, { status: 401 });
  try {
    const conversations = await listConversations(user.id);
    return Response.json({ conversations });
  } catch (e) {
    console.error("[conversations] list failed:", e);
    return Response.json({ error: "Failed to list conversations" }, { status: 500 });
  }
}
