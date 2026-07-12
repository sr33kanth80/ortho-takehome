import { listConversations } from "@/lib/db/store";
import { hasDatabase } from "@/lib/env";

/** GET /api/conversations — list recent conversations (empty in ephemeral mode). */
export async function GET() {
  try {
    const conversations = await listConversations();
    return Response.json({ conversations, persistent: hasDatabase() });
  } catch (e) {
    console.error("[conversations] list failed:", e);
    return Response.json({ error: "Failed to list conversations" }, { status: 500 });
  }
}
