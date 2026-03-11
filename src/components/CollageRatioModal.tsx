// @TheTechMargin 2026
"use client";

import { useEffect, useState, type ReactNode } from "react";
import type { CollageRatio } from "@/components/FloatingActionBar";

interface CollageRatioModalProps {
  onSelect: (ratio: CollageRatio) => void;
  onDismiss: () => void;
  selectedCount: number;
}

const RATIO_OPTIONS: {
  value: CollageRatio;
  label: string;
  description: string;
  icon: ReactNode;
}[] = [
  {
    value: "letterbox",
    label: "16:9",
    description: "WIDE / CINEMATIC",
    icon: (
      <svg width="48" height="27" viewBox="0 0 48 27" fill="none" stroke="currentColor" strokeWidth="1.5">
        <rect x="1" y="1" width="46" height="25" rx="1" />
        <line x1="16" y1="1" x2="16" y2="26" opacity="0.3" />
        <line x1="32" y1="1" x2="32" y2="26" opacity="0.3" />
        <line x1="1" y1="13" x2="47" y2="13" opacity="0.3" />
      </svg>
    ),
  },
  {
    value: "portrait",
    label: "9:16",
    description: "TALL / STORIES",
    icon: (
      <svg width="27" height="48" viewBox="0 0 27 48" fill="none" stroke="currentColor" strokeWidth="1.5">
        <rect x="1" y="1" width="25" height="46" rx="1" />
        <line x1="1" y1="16" x2="26" y2="16" opacity="0.3" />
        <line x1="1" y1="32" x2="26" y2="32" opacity="0.3" />
        <line x1="13" y1="1" x2="13" y2="47" opacity="0.3" />
      </svg>
    ),
  },
  {
    value: "square",
    label: "1:1",
    description: "SQUARE / SOCIAL",
    icon: (
      <svg width="40" height="40" viewBox="0 0 40 40" fill="none" stroke="currentColor" strokeWidth="1.5">
        <rect x="1" y="1" width="38" height="38" rx="1" />
        <line x1="1" y1="20" x2="39" y2="20" opacity="0.3" />
        <line x1="20" y1="1" x2="20" y2="39" opacity="0.3" />
      </svg>
    ),
  },
];

export default function CollageRatioModal({
  onSelect,
  onDismiss,
  selectedCount,
}: CollageRatioModalProps) {
  const [chosen, setChosen] = useState<CollageRatio | null>(null);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onDismiss();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onDismiss]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm"
      onClick={onDismiss}
    >
      <div
        className="relative border border-[var(--el-green-44)] bg-[var(--el-bg)] p-5 md:p-6 max-w-sm w-[90vw]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="absolute top-0 left-0 w-3 h-3 border-t-2 border-l-2 border-[var(--el-green)] -translate-x-px -translate-y-px" />
        <div className="absolute top-0 right-0 w-3 h-3 border-t-2 border-r-2 border-[var(--el-green)] translate-x-px -translate-y-px" />
        <div className="absolute bottom-0 left-0 w-3 h-3 border-b-2 border-l-2 border-[var(--el-green)] -translate-x-px translate-y-px" />
        <div className="absolute bottom-0 right-0 w-3 h-3 border-b-2 border-r-2 border-[var(--el-green)] translate-x-px translate-y-px" />

        <div className="text-center mb-5">
          <h2 className="text-xs font-mono uppercase tracking-widest text-[var(--el-green)]">
            COLLAGE FORMAT
          </h2>
          <p className="mt-1 text-[9px] font-mono uppercase tracking-wider text-[var(--el-green-d9)]">
            {selectedCount} PHOTO{selectedCount !== 1 ? "S" : ""} SELECTED
          </p>
        </div>

        <div className="flex flex-col gap-2">
          {RATIO_OPTIONS.map((opt) => {
            const active = chosen === opt.value;
            return (
              <button
                key={opt.value}
                onClick={() => setChosen(opt.value)}
                className={`group flex items-center gap-4 border px-4 py-3 transition-all ${
                  active
                    ? "border-[var(--el-green)] bg-[var(--el-green-11)] shadow-[0_0_12px_rgba(0,255,65,0.1)]"
                    : "border-[var(--el-green-22)] hover:border-[var(--el-green)] hover:bg-[var(--el-green-11)] hover:shadow-[0_0_12px_rgba(0,255,65,0.1)]"
                } active:bg-[var(--el-green-22)]`}
              >
                <div className={`shrink-0 w-12 h-12 flex items-center justify-center transition-colors ${
                  active ? "text-[var(--el-green)]" : "text-[var(--el-green-99)] group-hover:text-[var(--el-green)]"
                }`}>
                  {opt.icon}
                </div>
                <div className="text-left">
                  <span className={`block text-sm font-mono font-bold tracking-wider transition-colors ${
                    active ? "text-[var(--el-green)]" : "text-[var(--el-green-99)] group-hover:text-[var(--el-green)]"
                  }`}>
                    {opt.label}
                  </span>
                  <span className="block text-[9px] font-mono uppercase tracking-wider text-[var(--el-green-d9)]">
                    {opt.description}
                  </span>
                </div>
              </button>
            );
          })}
        </div>

        <button
          onClick={() => chosen && onSelect(chosen)}
          disabled={!chosen}
          className="mt-4 w-full inline-flex items-center justify-center gap-2 border border-[var(--el-green)] bg-[var(--el-green-11)] px-3 py-2.5 text-[11px] font-mono uppercase tracking-widest text-[var(--el-green)] hover:bg-[var(--el-green-22)] hover:shadow-[0_0_16px_rgba(0,255,65,0.15)] transition-all disabled:border-[var(--el-green-22)] disabled:text-[var(--el-green-44)] disabled:bg-transparent disabled:shadow-none disabled:cursor-not-allowed"
        >
          CREATE COLLAGE
        </button>

        <button
          onClick={onDismiss}
          className="mt-2 w-full px-3 py-1.5 text-[9px] font-mono uppercase tracking-wider text-[var(--el-green-44)] hover:text-[var(--el-green-99)] transition-colors"
        >
          CANCEL
        </button>

        <p className="mt-3 text-center text-[9px] font-mono uppercase tracking-wider text-[var(--el-green-44)]">
          ESC TO CLOSE
        </p>
      </div>
    </div>
  );
}
