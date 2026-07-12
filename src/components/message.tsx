"use client";

import type { UIMessage } from "ai";
import { isStaticToolUIPart } from "ai";
import { Markdown } from "./markdown";
import { ToolTrace } from "./tool-trace";

interface Meta {
  costCents?: number;
}

export function Message({ message }: { message: UIMessage }) {
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
      <div className="space-y-1">
        {message.parts.map((part, i) => {
          if (part.type === "text") {
            return <Markdown key={i} text={part.text} />;
          }
          if (isStaticToolUIPart(part)) {
            return <ToolTrace key={part.toolCallId} part={part} />;
          }
          if (part.type === "reasoning") {
            return null; // keep the UI focused; reasoning stays internal
          }
          return null;
        })}
      </div>
    </div>
  );
}
