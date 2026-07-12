"use client";

import { useState } from "react";
import type { ToolUIPart } from "ai";

/**
 * One row in the "trace log" — a tool invocation with live status and cost.
 * This is the signature element of the UI: users literally watch the
 * assistant spend cents against Orthogonal's catalog.
 */

const TOOL_LABEL: Record<string, string> = {
  enrich_company: "company profile",
  find_contact_by_linkedin: "contact from LinkedIn",
  enrich_person: "person enrichment",
  web_search: "web search",
  news_search: "news search",
  discover_apis: "catalog discovery",
  get_api_details: "endpoint schema",
  run_api: "catalog call",
};

interface ToolOutput {
  ok?: boolean;
  costCents?: number;
  error?: string;
  data?: string;
  truncated?: boolean;
}

function inputSummary(input: unknown): string {
  if (!input || typeof input !== "object") return "";
  const o = input as Record<string, unknown>;
  const pick =
    o.domain ?? o.q ?? o.prompt ?? o.profile ?? o.full_name ?? o.email ??
    (o.api && o.path ? `${o.api} ${o.path}` : undefined) ?? o.path;
  return typeof pick === "string" ? pick : JSON.stringify(pick ?? "");
}

function centsLabel(c?: number): string | null {
  if (c === undefined || c === null) return null;
  if (c === 0) return "free";
  return `${c}¢`;
}

export function ToolTrace({ part }: { part: ToolUIPart }) {
  const [open, setOpen] = useState(false);
  const name = part.type.replace(/^tool-/, "");
  const label = TOOL_LABEL[name] ?? name;
  const out = (part.state === "output-available" ? part.output : undefined) as ToolOutput | undefined;
  const running = part.state === "input-streaming" || part.state === "input-available";
  const failed = part.state === "output-error" || (out ? out.ok === false : false);
  const cost = centsLabel(out?.costCents);

  return (
    <div className="trace-enter my-1">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="group flex w-full items-center gap-2.5 rounded-md border border-[var(--border)] bg-[var(--bg-raised)] px-3 py-2 text-left transition-colors hover:border-[var(--border-strong)]"
      >
        {/* status glyph */}
        <span className="flex h-4 w-4 shrink-0 items-center justify-center">
          {running ? (
            <span className="h-2 w-2 animate-spin rounded-[2px] border border-[var(--accent)] border-t-transparent" />
          ) : failed ? (
            <span className="text-[13px] leading-none text-[var(--err)]">✕</span>
          ) : (
            <span className="text-[13px] leading-none text-[var(--ok)]">✓</span>
          )}
        </span>

        <span className="font-[family-name:var(--font-mono)] text-[12.5px] text-[var(--ink-dim)]">
          {label}
        </span>

        <span className="min-w-0 flex-1 truncate font-[family-name:var(--font-mono)] text-[12.5px] text-[var(--ink-faint)]">
          {inputSummary(part.input)}
        </span>

        {cost && (
          <span
            className={`shrink-0 rounded-full border px-2 py-px font-[family-name:var(--font-mono)] text-[11px] ${
              cost === "free"
                ? "border-[var(--border)] text-[var(--ink-faint)]"
                : "border-[var(--accent-dim)] bg-[var(--accent-glow)] text-[var(--accent)]"
            }`}
          >
            {cost}
          </span>
        )}

        <span className="shrink-0 text-[10px] text-[var(--ink-faint)] transition-transform group-hover:text-[var(--ink-dim)]">
          {open ? "▲" : "▼"}
        </span>
      </button>

      {open && (
        <div className="mt-1 space-y-2 rounded-md border border-[var(--border)] bg-[#0e0c0b] p-3 font-[family-name:var(--font-mono)] text-[12px]">
          <div>
            <div className="mb-1 text-[10px] uppercase tracking-wider text-[var(--ink-faint)]">input</div>
            <pre className="overflow-x-auto whitespace-pre-wrap break-all text-[var(--ink-dim)]">
              {JSON.stringify(part.input, null, 2)}
            </pre>
          </div>
          {failed && (
            <div>
              <div className="mb-1 text-[10px] uppercase tracking-wider text-[var(--err)]">error</div>
              <pre className="whitespace-pre-wrap break-all text-[var(--err)]">
                {part.state === "output-error" ? part.errorText : out?.error}
              </pre>
            </div>
          )}
          {out?.data && (
            <div>
              <div className="mb-1 text-[10px] uppercase tracking-wider text-[var(--ink-faint)]">
                result{out.truncated ? " (truncated)" : ""}
              </div>
              <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-all text-[var(--ink-dim)]">
                {formatData(out.data)}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function formatData(data: string): string {
  try {
    return JSON.stringify(JSON.parse(data), null, 2).slice(0, 4000);
  } catch {
    return data.slice(0, 4000);
  }
}
