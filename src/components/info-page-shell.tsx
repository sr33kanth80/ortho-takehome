"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import type { ConversationSummary } from "@/lib/db/store";
import { Sidebar } from "./sidebar";
import { MeridianFooter } from "./site-footer";

export function InfoPageShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [userEmail, setUserEmail] = useState<string | null>(null);

  const refreshSidebar = useCallback(async () => {
    try {
      const response = await fetch("/api/conversations");
      if (!response.ok) return;
      const data = (await response.json()) as { conversations: ConversationSummary[] };
      setConversations(data.conversations);
    } catch {
      /* Informational pages stay usable when history is unavailable. */
    }
  }, []);

  useEffect(() => {
    let active = true;
    void fetch("/api/conversations")
      .then(async (response) => {
        if (!response.ok) return;
        const data = (await response.json()) as { conversations: ConversationSummary[] };
        if (!active) return;
        setConversations(data.conversations);
      })
      .catch(() => {
        /* Informational pages stay usable when history is unavailable. */
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    void fetch("/api/auth/me")
      .then(async (response) => {
        if (!response.ok) return;
        const data = (await response.json()) as { user: { email: string } | null };
        setUserEmail(data.user?.email ?? null);
      })
      .catch(() => {});
  }, []);

  const deleteConversation = async (id: string) => {
    await fetch("/api/conversations/" + encodeURIComponent(id), { method: "DELETE" });
    void refreshSidebar();
  };

  return (
    <div className="relative z-10 flex h-full">
      <Sidebar
        conversations={conversations}
        activeId={null}
        userEmail={userEmail ?? "Sign in to save history"}
        onSelect={(id) => router.push("/?conversation=" + encodeURIComponent(id))}
        onNew={() => router.push("/")}
        onDelete={deleteConversation}
        onHome={() => router.push("/")}
        onSignOut={async () => {
          if (!userEmail) {
            router.push("/");
            return;
          }
          await fetch("/api/auth/logout", { method: "POST" });
          router.push("/");
        }}
      />
      <main className="info-page-scroll">
        <div className="info-page-frame">{children}</div>
        <MeridianFooter />
      </main>
    </div>
  );
}
