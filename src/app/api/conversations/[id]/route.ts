import { deleteConversation, getConversationMessages } from "@/lib/db/store";

/** GET /api/conversations/:id — full message history for one conversation. */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  try {
    const messages = await getConversationMessages(id);
    return Response.json({ id, messages });
  } catch (e) {
    console.error("[conversations] get failed:", e);
    return Response.json({ error: "Failed to load conversation" }, { status: 500 });
  }
}

/** DELETE /api/conversations/:id */
export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  try {
    await deleteConversation(id);
    return Response.json({ ok: true });
  } catch (e) {
    console.error("[conversations] delete failed:", e);
    return Response.json({ error: "Failed to delete conversation" }, { status: 500 });
  }
}
