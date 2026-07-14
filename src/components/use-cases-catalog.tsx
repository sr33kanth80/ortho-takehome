"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { RECIPES, type Recipe } from "@/lib/recipes";

export function UseCasesCatalog() {
  const [selected, setSelected] = useState<Recipe | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLElement>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  const closeRecipe = useCallback(() => {
    setSelected(null);
    requestAnimationFrame(() => triggerRef.current?.focus());
  }, []);

  useEffect(() => {
    if (!selected) return;
    const scroller = document.querySelector<HTMLElement>(".info-page-scroll");
    const previousOverflow = scroller?.style.overflow;
    if (scroller) scroller.style.overflow = "hidden";
    closeButtonRef.current?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeRecipe();
        return;
      }
      if (event.key !== "Tab" || !dialogRef.current) return;
      const focusable = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      );
      const first = focusable[0];
      const last = focusable.at(-1);
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      if (scroller) scroller.style.overflow = previousOverflow ?? "";
    };
  }, [closeRecipe, selected]);

  const openRecipe = (recipe: Recipe, trigger: HTMLButtonElement) => {
    triggerRef.current = trigger;
    setSelected(recipe);
  };

  return (
    <>
      <section className="use-cases-grid" aria-label="Meridian use cases">
        {RECIPES.map((recipe, index) => (
          <button
            key={recipe.slug}
            type="button"
            className="use-case-card"
            aria-haspopup="dialog"
            onClick={(event) => openRecipe(recipe, event.currentTarget)}
          >
            <span className="use-case-card-topline">
              <span>{String(index + 1).padStart(2, "0")}</span>
              <span>{recipe.tools.join(" + ")}</span>
            </span>
            <span className="use-case-card-title">{recipe.category}</span>
            <span className="use-case-card-description">{recipe.useCaseDescription}</span>
            <span className="use-case-card-footer">
              <span>{recipe.title}</span>
              <span className="use-case-card-link">
                View recipe <span aria-hidden>↗</span>
              </span>
            </span>
          </button>
        ))}
      </section>

      {selected && (
        <div
          className="fixed inset-y-0 right-0 left-[260px] z-[80] flex items-center justify-center p-6"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeRecipe();
          }}
        >
          <div
            className="pointer-events-none absolute inset-0 bg-[rgba(0,43,31,0.56)] backdrop-blur-[2px]"
            aria-hidden
          />
          <section
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="recipe-dialog-title"
            className="relative max-h-[calc(100svh-48px)] w-full max-w-[760px] overflow-y-auto rounded-[6px_18px_10px_6px] border border-[rgba(3,63,46,0.28)] bg-[var(--bg-raised)] shadow-[0_24px_80px_rgba(0,35,25,0.3)]"
          >
            <header className="flex items-start justify-between gap-8 border-b border-[var(--border)] px-7 py-6 sm:px-9 sm:py-8">
              <div>
                <p className="mb-3 font-[family-name:var(--font-mono)] text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--color-vivid-emerald)]">
                  Meridian recipe / {selected.category}
                </p>
                <h2
                  id="recipe-dialog-title"
                  className="m-0 font-[family-name:var(--font-display)] text-[40px] font-normal leading-[0.95] tracking-[-0.035em] text-[var(--color-forest-ink)] sm:text-[52px]"
                >
                  {selected.title}
                </h2>
                <p className="mt-4 max-w-[610px] text-[14px] leading-[1.55] text-[var(--ink-dim)]">
                  {selected.useCaseDescription}
                </p>
              </div>
              <button
                ref={closeButtonRef}
                type="button"
                onClick={closeRecipe}
                aria-label="Close recipe details"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[var(--border)] text-[20px] leading-none text-[var(--ink-dim)] transition-colors hover:border-[var(--border-strong)] hover:text-[var(--ink)]"
              >
                ×
              </button>
            </header>

            <div className="grid gap-0 sm:grid-cols-2">
              <RecipeDetail label="You provide" value={selected.input} />
              <RecipeDetail label="Meridian returns" value={selected.output} borderLeft />
            </div>

            <div className="border-t border-[var(--border)] px-7 py-6 sm:px-9 sm:py-8">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <p className="m-0 text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--ink-faint)]">
                  How it runs
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {selected.tools.map((tool) => (
                    <span
                      key={tool}
                      className="rounded-full bg-[var(--bg-hover)] px-2.5 py-1 font-[family-name:var(--font-mono)] text-[9px] text-[var(--ink-faint)]"
                    >
                      {tool}
                    </span>
                  ))}
                </div>
              </div>
              <ol className="mt-5 grid gap-3 p-0 sm:grid-cols-3">
                {selected.method.map((step, index) => (
                  <li
                    key={step}
                    className="list-none border-t border-[var(--border)] pt-3 text-[12px] leading-[1.5] text-[var(--ink-dim)]"
                  >
                    <span className="mb-2 block font-[family-name:var(--font-mono)] text-[9px] text-[var(--color-vivid-emerald)]">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    {step}
                  </li>
                ))}
              </ol>
              <div className="mt-6 border-l-2 border-[var(--color-vivid-emerald)] bg-[var(--bg-hover)] px-4 py-3">
                <p className="m-0 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--color-forest-ink)]">
                  Cost control
                </p>
                <p className="mt-1 text-[12px] leading-[1.5] text-[var(--ink-dim)]">
                  {selected.safeguard}
                </p>
              </div>
            </div>

            <footer className="flex flex-wrap items-center justify-between gap-4 border-t border-[var(--border)] px-7 py-5 sm:px-9">
              <button
                type="button"
                onClick={closeRecipe}
                className="text-[12px] text-[var(--ink-dim)] underline decoration-[var(--border-strong)] underline-offset-4 hover:text-[var(--ink)]"
              >
                Back to use cases
              </button>
              <Link
                href={`/?recipe=${selected.slug}#cookbook`}
                className="inline-flex items-center gap-8 rounded-[4px_10px_7px_4px] bg-[var(--color-forest-ink)] px-4 py-3 font-[family-name:var(--font-display)] text-[17px] text-white no-underline transition-transform hover:-translate-y-0.5"
              >
                Start in Meridian <span aria-hidden>→</span>
              </Link>
            </footer>
          </section>
        </div>
      )}
    </>
  );
}

function RecipeDetail({
  label,
  value,
  borderLeft = false,
}: {
  label: string;
  value: string;
  borderLeft?: boolean;
}) {
  return (
    <div className={`px-7 py-6 sm:px-9 ${borderLeft ? "sm:border-l sm:border-[var(--border)]" : ""}`}>
      <p className="m-0 text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--ink-faint)]">
        {label}
      </p>
      <p className="mt-2 text-[13px] leading-[1.55] text-[var(--ink-dim)]">{value}</p>
    </div>
  );
}
