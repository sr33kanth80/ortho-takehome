"use client";

import { useEffect, useRef, useState } from "react";

interface Props {
  disabled: boolean;
  streaming: boolean;
  onSend: (text: string) => void;
  onStop: () => void;
  /** Taller resting height for the landing hero. */
  large?: boolean;
}

export function Composer({ disabled, streaming, onSend, onStop, large = false }: Props) {
  const [value, setValue] = useState("");
  const ref = useRef<HTMLTextAreaElement>(null);

  // autosize — grows with content up to a ceiling. The taller resting height
  // for `large` mode is enforced via CSS min-height, not here.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const maxHeight = large ? 176 : 144;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, maxHeight)}px`;
    el.style.overflowY = el.scrollHeight > maxHeight ? "auto" : "hidden";
  }, [large, value]);

  const submit = () => {
    const text = value.trim();
    if (!text || disabled) return;
    onSend(text);
    setValue("");
  };

  return (
    <div
      className="relative rounded-[12px] border border-[var(--border)] bg-[var(--bg)] transition-shadow focus-within:shadow-[0_0_0_3px_rgba(3,152,97,0.18)]"
    >
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
        style={large ? { minHeight: 96 } : undefined}
        className="w-full resize-none overflow-y-auto bg-transparent px-4 py-4 pr-14 text-[16px] leading-[1.5] text-[var(--ink)] outline-none placeholder:text-[var(--ink-dim)]"
      />
      <div className="absolute bottom-2.5 right-2.5">
        {streaming ? (
          <button
            type="button"
            onClick={onStop}
            title="Stop generating"
            className="flex h-8 w-8 items-center justify-center rounded-[6px] border border-[var(--border)] bg-transparent text-[var(--ink-dim)] transition-colors hover:text-[var(--ink)]"
          >
            <span className="block h-2.5 w-2.5 bg-current" />
          </button>
        ) : (
          <button
            type="button"
            onClick={submit}
            disabled={!value.trim() || disabled}
            title="Send (Enter)"
            className="group flex h-8 w-8 items-center justify-center rounded-[12px] bg-[var(--color-forest-ink)] text-[var(--color-parchment)] transition-opacity hover:opacity-90 disabled:opacity-30"
          >
            <svg
              width="17"
              height="17"
              viewBox="0 0 24 24"
              fill="none"
              aria-hidden
              className="transition-transform duration-500 ease-in-out group-hover:rotate-[360deg]"
            >
              <path d="M12 1 Q13 11 23 12 Q13 13 12 23 Q11 13 1 12 Q11 11 12 1 Z" fill="currentColor" />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
}
