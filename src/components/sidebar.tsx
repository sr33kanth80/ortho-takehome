"use client";

import type { ConversationSummary } from "@/lib/db/store";

interface Props {
  conversations: ConversationSummary[];
  activeId: string | null;
  persistent: boolean;
  onSelect: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
}

export function Sidebar({ conversations, activeId, persistent, onSelect, onNew, onDelete }: Props) {
  return (
    <aside className="flex h-full w-[260px] shrink-0 flex-col border-r border-[var(--border)] bg-[var(--bg-sidebar)]">
      {/* brand mark */}
      <div className="px-4 pb-4 pt-5">
        <h1 className="text-[16px] font-medium leading-none text-[var(--ink)]">Meridian</h1>
        <p className="mt-1.5 text-[11px] leading-[1.43] text-[var(--ink-faint)]">
          live-data assistant
        </p>
      </div>

      <div className="px-3">
        <button
          type="button"
          onClick={onNew}
          className="flex w-full items-center gap-2 rounded-[6px] border border-[var(--border)] bg-transparent px-3 py-2 text-[14px] leading-[1.43] text-[var(--ink-dim)] transition-colors hover:text-[var(--ink)]"
        >
          <span aria-hidden>+</span> New conversation
        </button>
      </div>

      {/* section label */}
      <p className="mt-4 px-4 text-[12px] leading-[1.33] text-[var(--ink-dim)]">History</p>

      <nav className="mt-1 flex-1 space-y-0.5 overflow-y-auto px-3 pb-3">
        {conversations.map((c) => {
          const active = c.id === activeId;
          return (
            <div
              key={c.id}
              className={`group relative flex items-center rounded-[12px] transition-colors ${
                active ? "bg-[var(--accent)]" : "hover:bg-[var(--bg-hover)]"
              }`}
            >
              <button
                type="button"
                onClick={() => onSelect(c.id)}
                className={`min-w-0 flex-1 truncate px-3 py-2 text-left text-[14px] leading-[1.43] ${
                  active ? "text-white" : "text-[var(--ink-dim)]"
                }`}
              >
                {c.title}
              </button>
              <button
                type="button"
                title="Delete conversation"
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(c.id);
                }}
                className={`mr-2 hidden h-5 w-5 shrink-0 items-center justify-center rounded text-[11px] group-hover:flex ${
                  active ? "text-white/70 hover:text-white" : "text-[var(--ink-faint)] hover:text-[var(--ink)]"
                }`}
              >
                ✕
              </button>
            </div>
          );
        })}
        {persistent && conversations.length === 0 && (
          <p className="px-3 py-2 text-[12px] leading-[1.43] text-[var(--ink-faint)]">
            No conversations yet.
          </p>
        )}
      </nav>

      {!persistent && (
        <div className="border-t border-[var(--border)] px-4 py-3">
          <p className="text-[12px] leading-[1.43] text-[var(--ink-faint)]">
            Ephemeral mode: no database configured; history won&apos;t survive a refresh.
          </p>
        </div>
      )}

      <div className="border-t border-[var(--border)] px-4 py-3">
        <p className="text-[11px] leading-[1.43] text-[var(--ink-faint)]">
          data via{" "}
          <a
            href="https://orthogonal.com"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[var(--ink-dim)] underline decoration-[var(--border)] underline-offset-2 hover:text-[var(--ink)]"
          >
            orthogonal
          </a>{" "}
          · pay-per-call
        </p>
      </div>
    </aside>
  );
}
