import { deleteConversation, getConversationMessages } from "@/lib/db/store";
import { getCurrentUser } from "@/lib/auth";

/** GET /api/conversations/:id — full message history for one conversation. */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Sign in required" }, { status: 401 });
  const { id } = await ctx.params;
  try {
    const messages = await getConversationMessages(user.id, id);
    if (!messages) return Response.json({ error: "Conversation not found" }, { status: 404 });
    return Response.json({ id, messages });
  } catch (e) {
    console.error("[conversations] get failed:", e);
    return Response.json({ error: "Failed to load conversation" }, { status: 500 });
  }
}

/** DELETE /api/conversations/:id */
export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Sign in required" }, { status: 401 });
  const { id } = await ctx.params;
  try {
    const deleted = await deleteConversation(user.id, id);
    if (!deleted) return Response.json({ error: "Conversation not found" }, { status: 404 });
    return Response.json({ ok: true });
  } catch (e) {
    console.error("[conversations] delete failed:", e);
    return Response.json({ error: "Failed to delete conversation" }, { status: 500 });
  }
}
