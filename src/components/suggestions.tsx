"use client";

import { useRef, useState } from "react";

/**
 * Landing-page suggestion pills, grouped into categories that map to the
 * assistant's capabilities. Each category is a full-width panel in a
 * scroll-snap track; the user pages through with the arrow buttons or the
 * pagination dots.
 */
const CATEGORIES: { label: string; items: string[] }[] = [
  {
    label: "Companies",
    items: [
      "Profile the company behind stripe.com",
      "Give me a firmographic snapshot of anthropic.com",
      "What does the company at vercel.com do, and how big are they?",
      "Who are Notion's main competitors?",
    ],
  },
  {
    label: "People & contacts",
    items: [
      "Find contact details for linkedin.com/in/satyanadella",
      "Get an email for the profile linkedin.com/in/andrewyng",
      "Enrich the person behind the email sundar@google.com",
      "Who leads engineering at Shopify, and how do I reach them?",
    ],
  },
  {
    label: "News & web",
    items: [
      "What's the latest news about Anthropic?",
      "Summarize this week's headlines on OpenAI",
      "Search the web for best practices for RAG in 2026",
      "What are people saying about AI coding agents lately?",
    ],
  },
  {
    label: "Explore the catalog",
    items: [
      "What APIs are available in Orthogonal's catalog?",
      "What job-listing APIs are there? Use one to find AI engineer roles",
      "Find an email-verification API and check jobs@stripe.com",
      "What geolocation APIs exist? Look up 1600 Amphitheatre Pkwy",
    ],
  },
];

export function Suggestions({ onPick }: { onPick: (text: string) => void }) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const last = CATEGORIES.length - 1;

  const goTo = (i: number) => {
    const el = trackRef.current;
    if (!el) return;
    const clamped = Math.max(0, Math.min(last, i));
    // Instant, exact jump to the panel offset. `behavior:"auto"` overrides any
    // CSS smooth scrolling so it lands deterministically on the snap point
    // (a smooth programmatic scroll can be cancelled by `snap-mandatory`).
    el.scrollTo({ left: clamped * el.clientWidth, behavior: "auto" });
    setActive(clamped);
  };

  const onScroll = () => {
    const el = trackRef.current;
    if (!el) return;
    setActive(Math.round(el.scrollLeft / el.clientWidth));
  };

  return (
    <div className="w-full">
      {/* category label + arrows */}
      <div className="mb-2 flex items-center justify-between px-0.5">
        <span className="text-[12px] font-medium leading-none text-[var(--ink-dim)]">
          {CATEGORIES[active].label}
        </span>
        <div className="flex items-center gap-1.5">
          <ArrowButton dir="prev" disabled={active === 0} onClick={() => goTo(active - 1)} />
          <ArrowButton dir="next" disabled={active === last} onClick={() => goTo(active + 1)} />
        </div>
      </div>

      {/* scroll-snap track — one panel per category */}
      <div
        ref={trackRef}
        onScroll={onScroll}
        className="no-scrollbar flex snap-x snap-mandatory overflow-x-auto"
      >
        {CATEGORIES.map((cat) => (
          <div key={cat.label} className="w-full shrink-0 snap-start">
            <div className="grid grid-cols-1 gap-2 pr-0.5 sm:grid-cols-2">
              {cat.items.map((s, i) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => onPick(s)}
                  style={{ animationDelay: `${i * 60}ms` }}
                  className="msg-enter rounded-[16px] border border-[var(--border)] bg-[var(--bg-raised)] px-4 py-3 text-left text-[14px] leading-[1.43] text-[var(--ink-dim)] transition-colors hover:text-[var(--ink)] hover:border-[var(--border-strong)]"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* pagination dots */}
      <div className="mt-3 flex items-center justify-center gap-1.5">
        {CATEGORIES.map((cat, i) => (
          <button
            key={cat.label}
            type="button"
            aria-label={`Go to ${cat.label}`}
            aria-current={active === i}
            onClick={() => goTo(i)}
            className={`h-1.5 rounded-full transition-all ${
              active === i
                ? "w-4 bg-[var(--accent)]"
                : "w-1.5 bg-[var(--border-strong)] hover:bg-[var(--ink-faint)]"
            }`}
          />
        ))}
      </div>
    </div>
  );
}

function ArrowButton({
  dir,
  disabled,
  onClick,
}: {
  dir: "prev" | "next";
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={dir === "prev" ? "Previous suggestions" : "More suggestions"}
      className="flex h-6 w-6 items-center justify-center rounded-full border border-[var(--border)] text-[var(--ink-dim)] transition-colors hover:text-[var(--ink)] disabled:opacity-30"
    >
      <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden>
        <path
          d={dir === "prev" ? "M10 3.5L5.5 8l4.5 4.5" : "M6 3.5L10.5 8 6 12.5"}
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  );
}
