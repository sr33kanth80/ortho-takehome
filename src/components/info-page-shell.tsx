"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import type { ConversationSummary } from "@/lib/db/store";
import { Sidebar } from "./sidebar";
import { MeridianFooter } from "./site-footer";

export function InfoPageShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [persistent, setPersistent] = useState(true);

  const refreshSidebar = useCallback(async () => {
    try {
      const response = await fetch("/api/conversations");
      if (!response.ok) return;
      const data = (await response.json()) as {
        conversations: ConversationSummary[];
        persistent: boolean;
      };
      setConversations(data.conversations);
      setPersistent(data.persistent);
    } catch {
      /* Informational pages stay usable when history is unavailable. */
    }
  }, []);

  useEffect(() => {
    let active = true;
    void fetch("/api/conversations")
      .then(async (response) => {
        if (!response.ok) return;
        const data = (await response.json()) as {
          conversations: ConversationSummary[];
          persistent: boolean;
        };
        if (!active) return;
        setConversations(data.conversations);
        setPersistent(data.persistent);
      })
      .catch(() => {
        /* Informational pages stay usable when history is unavailable. */
      });
    return () => {
      active = false;
    };
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
        persistent={persistent}
        onSelect={(id) => router.push("/?conversation=" + encodeURIComponent(id))}
        onNew={() => router.push("/")}
        onDelete={deleteConversation}
        onHome={() => router.push("/")}
      />
      <main className="info-page-scroll">
        <div className="info-page-frame">{children}</div>
        <MeridianFooter />
      </main>
    </div>
  );
}
