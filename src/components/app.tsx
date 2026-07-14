"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Chat, useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { nanoid } from "nanoid";
import type { ConversationSummary } from "@/lib/db/store";
import { Composer } from "./composer";
import { Message } from "./message";
import { Sidebar } from "./sidebar";
import { Cookbook } from "./cookbook";
import { Suggestions } from "./suggestions";
import { VoiceMode } from "./voice";
import { MeridianFooterDock } from "./site-footer";
import { LoadingBreadcrumb } from "./ui/animated-loading-svg-text-shimmer";
import { AuthScreen } from "./auth-screen";
import type { AuthUser } from "@/lib/auth";

interface AppProps {
  initialConversationId?: string;
  initialRecipe?: string;
  user: AuthUser | null;
  authConfigured: boolean;
}

export function App(props: AppProps) {
  if (!props.user) return <AuthScreen configured={props.authConfigured} />;
  return <AuthenticatedApp {...props} user={props.user} />;
}

function AuthenticatedApp({ initialConversationId, initialRecipe, user }: AppProps & { user: AuthUser }) {
  const [conversationId, setConversationId] = useState<string>(() => nanoid(12));
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);

  // Persistent chat instances, one per conversation, kept alive for the whole
  // session so an in-flight stream keeps running even when the user navigates
  // to another conversation. useChat only subscribes to these instances; it
  // never aborts them on unmount, so switching away and back is safe.
  const [chats] = useState<Map<string, Chat<UIMessage>>>(() => new Map());

  const refreshSidebar = useCallback(async () => {
    try {
      const res = await fetch("/api/conversations");
      if (!res.ok) return;
      const data = (await res.json()) as { conversations: ConversationSummary[] };
      setConversations(data.conversations);
    } catch {
      /* sidebar refresh is best-effort */
    }
  }, []);

  const getOrCreateChat = useCallback(
    (id: string, initial?: UIMessage[]) => {
      let chat = chats.get(id);
      if (!chat) {
        chat = new Chat<UIMessage>({
          id,
          messages: initial ?? [],
          transport: new DefaultChatTransport({ api: "/api/chat", body: { id } }),
          onFinish: () => {
            void refreshSidebar();
          },
        });
        chats.set(id, chat);
      }
      return chat;
    },
    [chats, refreshSidebar],
  );

  useEffect(() => {
    let active = true;
    void fetch("/api/conversations")
      .then(async (response) => {
        if (!response.ok) return;
        const data = (await response.json()) as {
          conversations: ConversationSummary[];
        };
        if (!active) return;
        setConversations(data.conversations);
      })
      .catch(() => {
        /* sidebar refresh is best-effort */
      });
    return () => {
      active = false;
    };
  }, []);

  const openConversation = useCallback(
    async (id: string) => {
      // Already have a live (possibly still-streaming) instance? Just switch to
      // it — refetching would clobber an in-progress stream with stale DB state.
      if (chats.has(id)) {
        setConversationId(id);
        return;
      }
      try {
        const res = await fetch(`/api/conversations/${id}`);
        if (!res.ok) return;
        const data = (await res.json()) as { messages: UIMessage[] };
        getOrCreateChat(id, data.messages);
        setConversationId(id);
      } catch {
        /* ignore */
      }
    },
    [chats, getOrCreateChat],
  );

  useEffect(() => {
    if (!initialConversationId) return;
    let active = true;
    void fetch("/api/conversations/" + encodeURIComponent(initialConversationId))
      .then(async (response) => {
        if (!response.ok) return;
        const data = (await response.json()) as { messages: UIMessage[] };
        if (!active) return;
        getOrCreateChat(initialConversationId, data.messages);
        setConversationId(initialConversationId);
      })
      .catch(() => {
        /* A missing linked conversation falls back to a new chat. */
      });
    return () => {
      active = false;
    };
  }, [getOrCreateChat, initialConversationId]);

  const newConversation = useCallback(() => {
    const id = nanoid(12);
    getOrCreateChat(id, []);
    setConversationId(id);
  }, [getOrCreateChat]);

  const deleteConversation = useCallback(
    async (id: string) => {
      await fetch(`/api/conversations/${id}`, { method: "DELETE" });
      const chat = chats.get(id);
      if (chat) {
        try {
          chat.stop();
        } catch {
          /* ignore */
        }
        chats.delete(id);
      }
      if (id === conversationId) newConversation();
      void refreshSidebar();
    },
    [chats, conversationId, newConversation, refreshSidebar],
  );

  const activeChat = getOrCreateChat(conversationId);

  return (
    <div className="relative z-10 flex h-full">
      <Sidebar
        conversations={conversations}
        activeId={conversationId}
        userEmail={user.email}
        onSelect={openConversation}
        onNew={newConversation}
        onDelete={deleteConversation}
        onHome={newConversation}
        onSignOut={async () => {
          await fetch("/api/auth/logout", { method: "POST" });
          window.location.assign("/");
        }}
      />
      <ChatPane key={conversationId} chat={activeChat} initialRecipe={initialRecipe} />
    </div>
  );
}

function ChatPane({ chat, initialRecipe }: { chat: Chat<UIMessage>; initialRecipe?: string }) {
  const { messages, sendMessage, status, error, stop, regenerate, clearError } = useChat({ chat });

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

  if (empty) {
    return (
      <main className="relative flex h-full min-w-0 flex-1 flex-col overflow-hidden">
        <div className="landing-page-scroll flex-1 overflow-y-auto">
          <div className="landing-hero mx-auto flex w-full max-w-[680px] flex-col px-6">
            <div className="mb-3 flex justify-center">
              <span className="cook-heading relative font-[family-name:var(--font-display)] text-[44px] leading-[1.05] text-[var(--color-forest-ink)]">
                <span className="cook-steam" aria-hidden>
                  <i />
                  <i />
                  <i />
                  <i />
                  <i />
                  <i />
                  <i />
                </span>
                Let&apos;s Cook
              </span>
            </div>
            <p className="mx-auto mb-8 max-w-[560px] text-center text-[15px] leading-[1.5] text-[var(--ink-dim)]">
              Meridian answers with live data: company profiles, people &amp; contacts, web and news
              results, drawn from Orthogonal&apos;s API catalog, with every cent accounted for.
            </p>

            <Composer
              large
              disabled={streaming}
              streaming={streaming}
              onSend={(text) => sendMessage({ text })}
              onStop={stop}
            />
            <p className="mt-2 text-center text-[11px] leading-[1.43] text-[var(--ink-faint)]">
              answers are grounded in live paid API calls, with costs shown per tool call
            </p>
            <VoiceMode />

            <div className="mt-8">
              <Suggestions onPick={(text) => sendMessage({ text })} />
            </div>
          </div>

          <div className="mx-auto w-full max-w-[680px] px-6 pb-28 pt-12">
            <Cookbook
              initialRecipe={initialRecipe}
              onCook={(prompt) => sendMessage({ text: prompt })}
            />
          </div>
        </div>
        <MeridianFooterDock />
      </main>
    );
  }

  return (
    <main className="flex h-full min-w-0 flex-1 flex-col">
      <div ref={scrollRef} onScroll={onScroll} className="flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-[900px] px-6 py-8">
          <div className="space-y-7 pb-4">
            {messages.map((m, i) => (
              <Message
                key={m.id}
                message={m}
                streaming={streaming && m.role === "assistant" && i === messages.length - 1}
              />
            ))}
            {streaming && (
              <div className="msg-enter py-1 pl-1">
                <LoadingBreadcrumb />
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
          answers are grounded in live paid API calls, with costs shown per tool call
        </p>
        <VoiceMode />
      </div>
    </main>
  );
}
