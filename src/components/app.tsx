"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { nanoid } from "nanoid";
import type { ConversationSummary } from "@/lib/db/store";
import { Composer } from "./composer";
import { Message } from "./message";
import { Sidebar } from "./sidebar";

const SUGGESTIONS = [
  "Profile the company behind stripe.com",
  "What's the latest news about Anthropic?",
  "Find contact details for the LinkedIn profile linkedin.com/in/satyanadella",
  "What job-listing APIs are in the catalog? Use one to find AI engineer roles.",
];

export function App() {
  const [conversationId, setConversationId] = useState<string>(() => nanoid(12));
  const [initialMessages, setInitialMessages] = useState<UIMessage[]>([]);
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [persistent, setPersistent] = useState(true);
  const [chatKey, setChatKey] = useState(0); // bump to remount ChatPane

  const refreshSidebar = useCallback(async () => {
    try {
      const res = await fetch("/api/conversations");
      if (!res.ok) return;
      const data = (await res.json()) as { conversations: ConversationSummary[]; persistent: boolean };
      setConversations(data.conversations);
      setPersistent(data.persistent);
    } catch {
      /* sidebar refresh is best-effort */
    }
  }, []);

  useEffect(() => {
    void refreshSidebar();
  }, [refreshSidebar]);

  const openConversation = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/conversations/${id}`);
      if (!res.ok) return;
      const data = (await res.json()) as { messages: UIMessage[] };
      setConversationId(id);
      setInitialMessages(data.messages);
      setChatKey((k) => k + 1);
    } catch {
      /* ignore */
    }
  }, []);

  const newConversation = useCallback(() => {
    setConversationId(nanoid(12));
    setInitialMessages([]);
    setChatKey((k) => k + 1);
  }, []);

  const deleteConversation = useCallback(
    async (id: string) => {
      await fetch(`/api/conversations/${id}`, { method: "DELETE" });
      if (id === conversationId) newConversation();
      void refreshSidebar();
    },
    [conversationId, newConversation, refreshSidebar],
  );

  return (
    <div className="relative z-10 flex h-full">
      <Sidebar
        conversations={conversations}
        activeId={conversationId}
        persistent={persistent}
        onSelect={openConversation}
        onNew={newConversation}
        onDelete={deleteConversation}
      />
      <ChatPane
        key={chatKey}
        conversationId={conversationId}
        initialMessages={initialMessages}
        onTurnFinished={refreshSidebar}
      />
    </div>
  );
}

function ChatPane({
  conversationId,
  initialMessages,
  onTurnFinished,
}: {
  conversationId: string;
  initialMessages: UIMessage[];
  onTurnFinished: () => void;
}) {
  const { messages, sendMessage, status, error, stop, regenerate, clearError } = useChat({
    id: conversationId,
    messages: initialMessages,
    transport: new DefaultChatTransport({
      api: "/api/chat",
      body: { id: conversationId },
    }),
    onFinish: onTurnFinished,
  });

  const streaming = status === "submitted" || status === "streaming";
  const scrollRef = useRef<HTMLDivElement>(null);
  const [pinned, setPinned] = useState(true);

  // Stick to bottom while streaming, unless the user scrolled up.
  useEffect(() => {
    if (pinned) scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages, pinned]);

  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    setPinned(el.scrollHeight - el.scrollTop - el.clientHeight < 80);
  };

  const empty = messages.length === 0;

  return (
    <main className="flex h-full min-w-0 flex-1 flex-col">
      <div ref={scrollRef} onScroll={onScroll} className="flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-[900px] px-6 py-8">
          {empty ? (
            <EmptyState onPick={(t) => sendMessage({ text: t })} />
          ) : (
            <div className="space-y-7 pb-4">
              {messages.map((m) => (
                <Message key={m.id} message={m} />
              ))}
              {status === "submitted" && (
                <div className="msg-enter flex items-center gap-1.5 pl-1">
                  <span className="thinking-dot h-1.5 w-1.5 rounded-full bg-[var(--accent)]" />
                  <span className="thinking-dot h-1.5 w-1.5 rounded-full bg-[var(--accent)]" />
                  <span className="thinking-dot h-1.5 w-1.5 rounded-full bg-[var(--accent)]" />
                </div>
              )}
              {error && (
                <div className="rounded-[12px] border border-[var(--border)] bg-[var(--bg-raised)] px-4 py-3 text-[14px] leading-[1.43] text-[var(--err)]">
                  Something went wrong: {error.message || "request failed"}.{" "}
                  <button
                    type="button"
                    className="underline underline-offset-2 hover:text-[var(--ink)]"
                    onClick={() => {
                      clearError();
                      void regenerate();
                    }}
                  >
                    Retry
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="mx-auto w-full max-w-[900px] px-6 pb-5">
        <Composer
          disabled={streaming}
          streaming={streaming}
          onSend={(text) => sendMessage({ text })}
          onStop={stop}
        />
        <p className="mt-2 text-center text-[11px] leading-[1.43] text-[var(--ink-faint)]">
          answers are grounded in live paid API calls — costs shown per tool call
        </p>
      </div>
    </main>
  );
}

function EmptyState({ onPick }: { onPick: (t: string) => void }) {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center text-center">
      <div className="mb-3 text-[32px] font-medium leading-tight text-[var(--ink)]">
        Ask the real world.
      </div>
      <p className="mb-10 max-w-md text-[14px] leading-[1.43] text-[var(--ink-dim)]">
        Meridian answers with live data — company profiles, people &amp; contacts, web and news
        results — drawn from Orthogonal&apos;s API catalog, with every cent accounted for.
      </p>
      <div className="grid w-full max-w-xl grid-cols-1 gap-2 sm:grid-cols-2">
        {SUGGESTIONS.map((s, i) => (
          <button
            key={s}
            type="button"
            onClick={() => onPick(s)}
            style={{ animationDelay: `${i * 70}ms` }}
            className="msg-enter rounded-[16px] bg-[var(--bg-raised)] px-4 py-3 text-left text-[14px] leading-[1.43] text-[var(--ink-dim)] shadow-[var(--shadow-subtle)] transition-colors hover:text-[var(--ink)]"
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}
