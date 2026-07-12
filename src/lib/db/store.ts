import { and, desc, eq } from "drizzle-orm";
import type { UIMessage } from "ai";
import { getDb, schema } from "./index";

/**
 * Conversation storage. Every function no-ops (or returns empty) when there is
 * no database so the app degrades to ephemeral chats instead of crashing.
 */

export interface ConversationSummary {
  id: string;
  title: string;
  updatedAt: string;
}

export async function listConversations(limit = 50): Promise<ConversationSummary[]> {
  const db = getDb();
  if (!db) return [];
  const rows = await db
    .select({
      id: schema.conversations.id,
      title: schema.conversations.title,
      updatedAt: schema.conversations.updatedAt,
    })
    .from(schema.conversations)
    .orderBy(desc(schema.conversations.updatedAt))
    .limit(limit);
  return rows.map((r) => ({ ...r, updatedAt: r.updatedAt.toISOString() }));
}

export async function getConversationMessages(conversationId: string): Promise<UIMessage[]> {
  const db = getDb();
  if (!db) return [];
  const rows = await db
    .select()
    .from(schema.messages)
    .where(eq(schema.messages.conversationId, conversationId))
    .orderBy(schema.messages.createdAt);
  return rows.map((r) => ({
    id: r.id,
    role: r.role as UIMessage["role"],
    parts: r.parts as UIMessage["parts"],
    metadata: { costCents: r.costCents },
  }));
}

export async function ensureConversation(id: string, title?: string): Promise<void> {
  const db = getDb();
  if (!db) return;
  await db
    .insert(schema.conversations)
    .values({ id, title: title ?? "New conversation" })
    .onConflictDoNothing();
}

/** Derive a short title from the first user message. */
export function titleFrom(text: string): string {
  const t = text.trim().replace(/\s+/g, " ");
  return t.length > 60 ? `${t.slice(0, 57)}...` : t || "New conversation";
}

export async function saveMessages(
  conversationId: string,
  msgs: Array<{ message: UIMessage; costCents?: number }>,
  opts?: { titleIfNew?: string },
): Promise<void> {
  const db = getDb();
  if (!db) return;
  await ensureConversation(conversationId, opts?.titleIfNew);
  for (const { message, costCents } of msgs) {
    await db
      .insert(schema.messages)
      .values({
        id: message.id,
        conversationId,
        role: message.role as "user" | "assistant" | "system",
        parts: message.parts,
        costCents: costCents ?? 0,
      })
      .onConflictDoUpdate({
        target: schema.messages.id,
        set: { parts: message.parts, costCents: costCents ?? 0 },
      });
  }
  await db
    .update(schema.conversations)
    .set({ updatedAt: new Date() })
    .where(eq(schema.conversations.id, conversationId));
  if (opts?.titleIfNew) {
    // Set title only if it is still the default (i.e. this is the first turn).
    await db
      .update(schema.conversations)
      .set({ title: opts.titleIfNew })
      .where(
        and(
          eq(schema.conversations.id, conversationId),
          eq(schema.conversations.title, "New conversation"),
        ),
      );
  }
}

export async function deleteConversation(id: string): Promise<void> {
  const db = getDb();
  if (!db) return;
  await db.delete(schema.conversations).where(eq(schema.conversations.id, id));
}
