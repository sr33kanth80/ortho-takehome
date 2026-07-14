import { and, desc, eq } from "drizzle-orm";
import type { UIMessage } from "ai";
import { getDb, schema } from "./index";

/**
 * Conversation storage. When a database is configured (DATABASE_URL) it is the
 * source of truth. Otherwise we fall back to a process-local in-memory store so
 * conversation history still works out-of-the-box — it survives navigation and
 * browser refreshes within the running server, but resets when the server
 * restarts (true ephemeral mode). The DB path is unchanged.
 */

export interface ConversationSummary {
  id: string;
  title: string;
  updatedAt: string;
}

// ── in-memory fallback ──────────────────────────────────────────────────────
// Stashed on globalThis so state survives HMR module reloads in dev.
interface MemMessage {
  id: string;
  role: UIMessage["role"];
  parts: UIMessage["parts"];
  costCents: number;
  createdAt: number;
}
interface MemConversation {
  id: string;
  title: string;
  updatedAt: number;
  messages: MemMessage[];
}
const memStore: Map<string, MemConversation> = ((
  globalThis as typeof globalThis & { __meridianMem?: Map<string, MemConversation> }
).__meridianMem ??= new Map());

export async function listConversations(limit = 50): Promise<ConversationSummary[]> {
  const db = getDb();
  if (!db) {
    return [...memStore.values()]
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, limit)
      .map((c) => ({
        id: c.id,
        title: c.title,
        updatedAt: new Date(c.updatedAt).toISOString(),
      }));
  }
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
  if (!db) {
    const conv = memStore.get(conversationId);
    if (!conv) return [];
    return [...conv.messages]
      .sort((a, b) => a.createdAt - b.createdAt)
      .map((m) => ({
        id: m.id,
        role: m.role,
        parts: m.parts,
        metadata: { costCents: m.costCents },
      }));
  }
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
  if (!db) {
    if (!memStore.has(id)) {
      memStore.set(id, {
        id,
        title: title ?? "New conversation",
        updatedAt: Date.now(),
        messages: [],
      });
    }
    return;
  }
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
  if (!db) {
    await ensureConversation(conversationId, opts?.titleIfNew);
    const conv = memStore.get(conversationId)!;
    for (const { message, costCents } of msgs) {
      const existing = conv.messages.find((m) => m.id === message.id);
      if (existing) {
        existing.parts = message.parts;
        existing.costCents = costCents ?? 0;
      } else {
        conv.messages.push({
          id: message.id,
          role: message.role,
          parts: message.parts,
          costCents: costCents ?? 0,
          createdAt: Date.now() + conv.messages.length, // preserve insertion order
        });
      }
    }
    conv.updatedAt = Date.now();
    // Set title only if still the default (first turn).
    if (opts?.titleIfNew && conv.title === "New conversation") {
      conv.title = opts.titleIfNew;
    }
    return;
  }
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
  if (!db) {
    memStore.delete(id);
    return;
  }
  await db.delete(schema.conversations).where(eq(schema.conversations.id, id));
}
