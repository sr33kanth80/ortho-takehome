"use client";

import { useRef, useState } from "react";
import { RECIPES } from "@/lib/recipes";

const PER_PAGE = 2;
const PAGE_COUNT = Math.ceil(RECIPES.length / PER_PAGE);

export function Cookbook({
  onCook,
  initialRecipe,
}: {
  onCook: (prompt: string) => void;
  initialRecipe?: string;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const initialIndex = Math.max(
    0,
    RECIPES.findIndex((recipe) => recipe.slug === initialRecipe),
  );
  const [active, setActive] = useState(Math.floor(initialIndex / PER_PAGE));

  const goTo = (page: number) => {
    const track = trackRef.current;
    if (!track) return;
    const next = Math.max(0, Math.min(PAGE_COUNT - 1, page));
    track.scrollTo({ left: next * track.clientWidth, behavior: "auto" });
    setActive(next);
  };

  const onScroll = () => {
    const track = trackRef.current;
    if (!track) return;
    setActive(Math.round(track.scrollLeft / track.clientWidth));
  };

  return (
    <section id="cookbook" className="cookbook-shell" aria-labelledby="cookbook-title">
      <div className="mb-5 flex items-end justify-between gap-6">
        <div>
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--color-vivid-emerald)]">
            Meridian Cookbook
          </p>
          <h2
            id="cookbook-title"
            className="font-[family-name:var(--font-display)] text-[30px] font-normal leading-none text-[var(--color-forest-ink)]"
          >
            Pick a recipe
          </h2>
          <p className="mt-2 text-[13px] text-[var(--ink-dim)]">
            Ready-made research flows powered by live data.
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          <CookbookArrow
            direction="previous"
            disabled={active === 0}
            onClick={() => goTo(active - 1)}
          />
          <CookbookArrow
            direction="next"
            disabled={active === PAGE_COUNT - 1}
            onClick={() => goTo(active + 1)}
          />
        </div>
      </div>

      <div
        ref={trackRef}
        onScroll={onScroll}
        className="no-scrollbar flex snap-x snap-mandatory overflow-x-auto"
      >
        {Array.from({ length: PAGE_COUNT }, (_, page) => (
          <div key={page} className="grid w-full shrink-0 snap-start grid-cols-1 gap-2 pr-0.5 sm:grid-cols-2">
            {RECIPES.slice(page * PER_PAGE, page * PER_PAGE + PER_PAGE).map((recipe) => (
              <button
                key={recipe.slug}
                type="button"
                onClick={() => onCook(recipe.prompt)}
                className="group flex min-h-[190px] flex-col rounded-[16px] border border-[var(--border)] bg-[var(--bg-raised)] p-5 text-left transition-colors hover:border-[var(--border-strong)]"
              >
                <span className="text-[10px] font-semibold uppercase tracking-[0.09em] text-[var(--ink-faint)]">
                  {recipe.category}
                </span>
                <span className="mt-4 font-[family-name:var(--font-display)] text-[23px] leading-[1.05] text-[var(--color-forest-ink)]">
                  {recipe.title}
                </span>
                <span className="mt-2 text-[12px] leading-[1.45] text-[var(--ink-dim)]">
                  {recipe.description}
                </span>
                <span className="mt-auto flex items-end justify-between gap-4 pt-5">
                  <span className="flex flex-wrap gap-1.5">
                    {recipe.tools.map((tool) => (
                      <span
                        key={tool}
                        className="rounded-full bg-[var(--bg-hover)] px-2 py-1 font-[family-name:var(--font-mono)] text-[9px] text-[var(--ink-faint)]"
                      >
                        {tool}
                      </span>
                    ))}
                  </span>
                  <span className="text-[12px] text-[var(--color-vivid-emerald)] transition-transform group-hover:translate-x-0.5">
                    Start →
                  </span>
                </span>
              </button>
            ))}
          </div>
        ))}
      </div>

      <div className="mt-3 flex justify-center gap-1.5">
        {Array.from({ length: PAGE_COUNT }, (_, page) => (
          <button
            key={page}
            type="button"
            aria-label={`Go to cookbook page ${page + 1}`}
            aria-current={active === page}
            onClick={() => goTo(page)}
            className={`h-1.5 rounded-full transition-all ${
              active === page
                ? "w-4 bg-[var(--accent)]"
                : "w-1.5 bg-[var(--border-strong)] hover:bg-[var(--ink-faint)]"
            }`}
          />
        ))}
      </div>
    </section>
  );
}

function CookbookArrow({
  direction,
  disabled,
  onClick,
}: {
  direction: "previous" | "next";
  disabled: boolean;
  onClick: () => void;
}) {
  const previous = direction === "previous";
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      aria-label={`${previous ? "Previous" : "Next"} recipes`}
      className="flex h-7 w-7 items-center justify-center rounded-full border border-[var(--border)] text-[var(--ink-dim)] transition-colors hover:border-[var(--border-strong)] hover:text-[var(--ink)] disabled:opacity-30"
    >
      <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden>
        <path
          d={previous ? "M10 3.5L5.5 8l4.5 4.5" : "M6 3.5L10.5 8 6 12.5"}
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  );
}
