"use client";

import { useEffect, useRef, useState } from "react";

interface Props {
  disabled: boolean;
  streaming: boolean;
  onSend: (text: string) => void;
  onStop: () => void;
}

export function Composer({ disabled, streaming, onSend, onStop }: Props) {
  const [value, setValue] = useState("");
  const ref = useRef<HTMLTextAreaElement>(null);

  // autosize
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, [value]);

  const submit = () => {
    const text = value.trim();
    if (!text || disabled) return;
    onSend(text);
    setValue("");
  };

  return (
    <div className="relative rounded-xl border border-[var(--border-strong)] bg-[var(--bg-raised)] shadow-[0_-12px_40px_rgba(0,0,0,0.4)] transition-colors focus-within:border-[var(--accent-dim)]">
      <textarea
        ref={ref}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            submit();
          }
        }}
        rows={1}
        placeholder="Ask about a company, a person, or anything on the web…"
        className="w-full resize-none bg-transparent px-4 py-3.5 pr-14 text-[15px] leading-6 outline-none placeholder:text-[var(--ink-faint)]"
      />
      <div className="absolute bottom-2.5 right-2.5">
        {streaming ? (
          <button
            type="button"
            onClick={onStop}
            title="Stop generating"
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--border-strong)] bg-[var(--bg-hover)] text-[var(--ink-dim)] transition-colors hover:text-[var(--err)]"
          >
            <span className="block h-2.5 w-2.5 bg-current" />
          </button>
        ) : (
          <button
            type="button"
            onClick={submit}
            disabled={!value.trim() || disabled}
            title="Send (Enter)"
            className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--accent)] text-[#131110] transition-all hover:brightness-110 disabled:opacity-30"
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
              <path d="M8 13V3M8 3L3.5 7.5M8 3l4.5 4.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
}
