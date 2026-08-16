import { and, asc, desc, eq } from "drizzle-orm";
import type { UIMessage } from "ai";
import { getDb, schema } from "./index";

export interface ConversationSummary {
  id: string;
  title: string;
  updatedAt: string;
}

export interface ConversationOwner {
  userId: string;
  companyId: string;
}

function requireDb() {
  const db = getDb();
  if (!db) throw new Error("DATABASE_URL is required for Meridian accounts and history.");
  return db;
}

export async function listConversations(owner: ConversationOwner, limit = 50): Promise<ConversationSummary[]> {
  const db = requireDb();
  const rows = await db
    .select({ id: schema.conversations.id, title: schema.conversations.title, updatedAt: schema.conversations.updatedAt })
    .from(schema.conversations)
    .where(and(eq(schema.conversations.userId, owner.userId), eq(schema.conversations.companyId, owner.companyId)))
    .orderBy(desc(schema.conversations.updatedAt))
    .limit(limit);
  return rows.map((row) => ({ ...row, updatedAt: row.updatedAt.toISOString() }));
}

export async function getConversationMessages(owner: ConversationOwner, conversationId: string): Promise<UIMessage[] | null> {
  const db = requireDb();
  const [conversation] = await db
    .select({ id: schema.conversations.id })
    .from(schema.conversations)
    .where(and(
      eq(schema.conversations.id, conversationId),
      eq(schema.conversations.userId, owner.userId),
      eq(schema.conversations.companyId, owner.companyId),
    ))
    .limit(1);
  if (!conversation) return null;

  const rows = await db
    .select()
    .from(schema.messages)
    .where(eq(schema.messages.conversationId, conversationId))
    .orderBy(asc(schema.messages.createdAt));
  return rows.map((row) => ({
    id: row.id,
    role: row.role as UIMessage["role"],
    parts: row.parts as UIMessage["parts"],
    metadata: { costCents: row.costCents },
  }));
}

export async function ensureConversation(owner: ConversationOwner, id: string, title?: string): Promise<void> {
  const db = requireDb();
  await db.insert(schema.conversations).values({
    id,
    userId: owner.userId,
    companyId: owner.companyId,
    title: title ?? "New conversation",
  }).onConflictDoNothing();
  const [conversation] = await db
    .select({ userId: schema.conversations.userId, companyId: schema.conversations.companyId })
    .from(schema.conversations)
    .where(eq(schema.conversations.id, id))
    .limit(1);
  if (!conversation || conversation.userId !== owner.userId || conversation.companyId !== owner.companyId) {
    throw new Error("Conversation does not belong to this account.");
  }
}

export function titleFrom(text: string): string {
  const title = text.trim().replace(/\s+/g, " ");
  return title.length > 60 ? `${title.slice(0, 57)}...` : title || "New conversation";
}

export async function saveMessages(
  owner: ConversationOwner,
  conversationId: string,
  messages: Array<{ message: UIMessage; costCents?: number }>,
  options?: { titleIfNew?: string },
): Promise<void> {
  const db = requireDb();
  await ensureConversation(owner, conversationId, options?.titleIfNew);
  for (const { message, costCents } of messages) {
    await db
      .insert(schema.messages)
      .values({
        id: message.id,
        conversationId,
        role: message.role as "user" | "assistant" | "system",
        parts: message.parts,
        costCents: costCents ?? 0,
      })
      .onConflictDoUpdate({ target: schema.messages.id, set: { parts: message.parts, costCents: costCents ?? 0 } });
  }
  await db
    .update(schema.conversations)
    .set({ updatedAt: new Date() })
    .where(and(
      eq(schema.conversations.id, conversationId),
      eq(schema.conversations.userId, owner.userId),
      eq(schema.conversations.companyId, owner.companyId),
    ));
  if (options?.titleIfNew) {
    await db
      .update(schema.conversations)
      .set({ title: options.titleIfNew })
      .where(and(
        eq(schema.conversations.id, conversationId),
        eq(schema.conversations.userId, owner.userId),
        eq(schema.conversations.companyId, owner.companyId),
        eq(schema.conversations.title, "New conversation"),
      ));
  }
}

export async function deleteConversation(owner: ConversationOwner, id: string): Promise<boolean> {
  const db = requireDb();
  const deleted = await db
    .delete(schema.conversations)
    .where(and(
      eq(schema.conversations.id, id),
      eq(schema.conversations.userId, owner.userId),
      eq(schema.conversations.companyId, owner.companyId),
    ))
    .returning({ id: schema.conversations.id });
  return deleted.length > 0;
}
