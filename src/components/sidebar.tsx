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
    <aside className="flex h-full w-[264px] shrink-0 flex-col border-r border-[var(--border)] bg-[#100e0d]">
      {/* brand */}
      <div className="px-5 pb-4 pt-5">
        <h1 className="font-[family-name:var(--font-display)] text-[26px] leading-none tracking-wide">
          Meridian
        </h1>
        <p className="mt-1.5 font-[family-name:var(--font-mono)] text-[10.5px] uppercase tracking-[0.14em] text-[var(--ink-faint)]">
          live-data assistant
        </p>
      </div>

      <div className="px-3">
        <button
          type="button"
          onClick={onNew}
          className="flex w-full items-center gap-2 rounded-lg border border-[var(--border-strong)] bg-[var(--bg-raised)] px-3 py-2 text-[13.5px] text-[var(--ink-dim)] transition-colors hover:border-[var(--accent-dim)] hover:text-[var(--ink)]"
        >
          <span className="text-[var(--accent)]">+</span> New conversation
        </button>
      </div>

      <nav className="mt-3 flex-1 space-y-0.5 overflow-y-auto px-3 pb-3">
        {conversations.map((c) => (
          <div
            key={c.id}
            className={`group relative flex items-center rounded-lg transition-colors ${
              c.id === activeId ? "bg-[var(--bg-hover)]" : "hover:bg-[var(--bg-raised)]"
            }`}
          >
            <button
              type="button"
              onClick={() => onSelect(c.id)}
              className={`min-w-0 flex-1 truncate px-3 py-2 text-left text-[13px] ${
                c.id === activeId ? "text-[var(--ink)]" : "text-[var(--ink-dim)]"
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
              className="mr-2 hidden h-5 w-5 shrink-0 items-center justify-center rounded text-[11px] text-[var(--ink-faint)] hover:text-[var(--err)] group-hover:flex"
            >
              ✕
            </button>
          </div>
        ))}
        {persistent && conversations.length === 0 && (
          <p className="px-3 py-2 text-[12.5px] text-[var(--ink-faint)]">No conversations yet.</p>
        )}
      </nav>

      {!persistent && (
        <div className="border-t border-[var(--border)] px-5 py-3">
          <p className="text-[11.5px] leading-relaxed text-[var(--ink-faint)]">
            <span className="text-[var(--accent-dim)]">ephemeral mode</span> — no database
            configured; history won&apos;t survive a refresh.
          </p>
        </div>
      )}

      <div className="border-t border-[var(--border)] px-5 py-3">
        <p className="font-[family-name:var(--font-mono)] text-[10.5px] leading-relaxed text-[var(--ink-faint)]">
          data via{" "}
          <a
            href="https://orthogonal.com"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[var(--accent-dim)] hover:text-[var(--accent)]"
          >
            orthogonal
          </a>{" "}
          · pay-per-call
        </p>
      </div>
    </aside>
  );
}
