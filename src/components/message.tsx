"use client";

import { Fragment, useState, type ReactNode } from "react";
import type { UIMessage, ToolUIPart } from "ai";
import { isStaticToolUIPart } from "ai";
import { Markdown } from "./markdown";
import { ToolTrace } from "./tool-trace";

interface Meta {
  costCents?: number;
}

export function Message({
  message,
  streaming = false,
}: {
  message: UIMessage;
  streaming?: boolean;
}) {
  const meta = message.metadata as Meta | undefined;

  if (message.role === "user") {
    const text = message.parts
      .filter((p): p is { type: "text"; text: string } => p.type === "text")
      .map((p) => p.text)
      .join("");
    return (
      <div className="msg-enter flex justify-end">
        <div className="max-w-[85%] whitespace-pre-wrap rounded-[16px] border border-[var(--border)] bg-[var(--bg-raised)] px-4 py-2.5 text-[16px] leading-[1.5]">
          {text}
        </div>
      </div>
    );
  }

  // Walk the parts in order, grouping each run of consecutive tool calls so the
  // "process" can be folded away once the turn is done. While streaming, the
  // traces stay live and expanded; once final, they collapse into a compact,
  // expandable summary so only the clean result remains on screen.
  const rendered: ReactNode[] = [];
  let toolRun: ToolUIPart[] = [];

  const flushTools = (key: string) => {
    if (toolRun.length === 0) return;
    const group = toolRun;
    toolRun = [];
    rendered.push(
      streaming ? (
        <Fragment key={key}>
          {group.map((part) => (
            <ToolTrace key={part.toolCallId} part={part} />
          ))}
        </Fragment>
      ) : (
        <CollapsedTools key={key} parts={group} />
      ),
    );
  };

  message.parts.forEach((part, i) => {
    if (isStaticToolUIPart(part)) {
      toolRun.push(part);
      return;
    }
    if (part.type === "text") {
      flushTools(`tools-${i}`);
      rendered.push(<Markdown key={i} text={part.text} />);
      return;
    }
    // reasoning and other part types stay internal
  });
  flushTools("tools-end");

  return (
    <div className="msg-enter">
      <div className="mb-1.5 flex items-baseline gap-2">
        <span className="text-[14px] font-medium leading-[1.43] text-[var(--ink)]">Meridian</span>
        {meta?.costCents !== undefined && meta.costCents > 0 && (
          <span className="text-[11px] leading-[1.43] text-[var(--ink-faint)]">
            turn cost {meta.costCents}¢
          </span>
        )}
      </div>
      <div className="space-y-1">{rendered}</div>
    </div>
  );
}

/**
 * A finished run of tool calls, folded into a single quiet disclosure. Collapsed
 * by default so the final answer reads cleanly; expandable to review the work.
 */
function CollapsedTools({ parts }: { parts: ToolUIPart[] }) {
  const [open, setOpen] = useState(false);
  const n = parts.length;
  const anyFailed = parts.some(
    (p) => p.state === "output-error" || (p.state === "output-available" && (p.output as { ok?: boolean })?.ok === false),
  );

  return (
    <div className="trace-enter">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--bg-raised)] px-3 py-1 text-[12px] leading-none text-[var(--ink-faint)] transition-colors hover:text-[var(--ink-dim)]"
      >
        <span className={anyFailed ? "text-[var(--err)]" : "text-[var(--accent)]"}>
          {anyFailed ? "✕" : "✓"}
        </span>
        <span>
          {n} step{n > 1 ? "s" : ""}
        </span>
        <span className="text-[var(--ink-faint)]">·</span>
        <span>{open ? "hide work" : "show work"}</span>
        <span className="text-[10px]">{open ? "▲" : "▼"}</span>
      </button>
      {open && (
        <div className="mt-1 space-y-1">
          {parts.map((part) => (
            <ToolTrace key={part.toolCallId} part={part} />
          ))}
        </div>
      )}
    </div>
  );
}
