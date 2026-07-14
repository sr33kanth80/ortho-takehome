"use client";

import React, { useEffect, useRef, useState } from "react";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

let cachedPathLength = 0;

interface LoaderProps extends React.SVGProps<SVGSVGElement> {
  size?: number | string;
  strokeWidth?: number | string;
}

const Loader = React.forwardRef<SVGSVGElement, LoaderProps>(
  ({ className, size = 18, strokeWidth = 2.5, ...props }, ref) => {
    const pathRef = useRef<SVGPathElement>(null);
    const [pathLength, setPathLength] = useState(cachedPathLength);

    useEffect(() => {
      if (!cachedPathLength && pathRef.current) {
        cachedPathLength = pathRef.current.getTotalLength();
        setPathLength(cachedPathLength);
      }
    }, []);

    const ready = pathLength > 0;

    return (
      <svg
        ref={ref}
        viewBox="0 0 19 19"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        width={size}
        height={size}
        className={cn("text-current", className)}
        aria-hidden="true"
        {...props}
      >
        <path
          ref={pathRef}
          d="M4.43431 2.42415C-0.789139 6.90104 1.21472 15.2022 8.434 15.9242C15.5762 16.6384 18.8649 9.23035 15.9332 4.5183C14.1316 1.62255 8.43695 0.0528911 7.51841 3.33733C6.48107 7.04659 15.2699 15.0195 17.4343 16.9241"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          style={
            ready
              ? ({
                  strokeDasharray: pathLength,
                  "--path-length": pathLength,
                } as React.CSSProperties)
              : undefined
          }
          className={cn("cooking-loader-path", ready && "cooking-loader-path-ready")}
        />
      </svg>
    );
  },
);

Loader.displayName = "Loader";

interface LoadingBreadcrumbProps {
  text?: string;
  className?: string;
}

export function LoadingBreadcrumb({ text = "Cooking", className }: LoadingBreadcrumbProps) {
  return (
    <div
      className={cn(
        "cooking-status flex items-center gap-2 text-[15px] font-medium tracking-wide",
        className,
      )}
      role="status"
      aria-live="polite"
      aria-label={`${text}. Meridian is still working.`}
    >
      <Loader className="text-[var(--color-forest-ink)]" />
      <span className="cooking-shimmer-text">{text}</span>
      <ChevronRight size={16} className="text-[var(--ink-faint)]" aria-hidden="true" />
    </div>
  );
}
