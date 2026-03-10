// @TheTechMargin 2026
"use client";

import { useEffect, useState } from "react";

interface ToastProps {
  message: string;
  action?: { label: string; onClick: () => void };
  duration?: number;
  onDismiss: () => void;
}

export default function Toast({
  message,
  action,
  duration = 10000,
  onDismiss,
}: ToastProps) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    requestAnimationFrame(() => setVisible(true));
    const timer = setTimeout(() => {
      setVisible(false);
      setTimeout(onDismiss, 300);
    }, duration);
    return () => clearTimeout(timer);
  }, [duration, onDismiss]);

  return (
    <div
      className={`fixed bottom-4 left-3 right-3 z-40 sm:left-1/2 sm:right-auto sm:-translate-x-1/2 sm:bottom-6 mb-safe-bottom transition-all duration-300 ${
        visible
          ? "translate-y-0 opacity-100"
          : "translate-y-4 opacity-0"
      }`}
    >
      <div className="flex items-center justify-between gap-2 sm:gap-3 border border-[var(--el-green-44)] bg-[var(--el-bg)] px-3 py-2.5 sm:px-4 sm:py-3 shadow-[0_0_20px_rgba(0,255,65,0.1)]">
        <span className="text-[10px] font-mono uppercase tracking-wider text-[var(--el-green)] min-w-0 truncate">
          &#9679; {message.toUpperCase()}
        </span>
        <div className="flex items-center gap-2 shrink-0">
          {action && (
            <button
              onClick={action.onClick}
              className="border border-[var(--el-green-99)] px-3 py-1.5 sm:py-1 text-[10px] font-mono uppercase tracking-wider text-[var(--el-green-99)] active:bg-[var(--el-green-11)] transition-all focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--el-green)]"
            >
              [{action.label}]
            </button>
          )}
          <button
            onClick={() => {
              setVisible(false);
              setTimeout(onDismiss, 300);
            }}
            className="p-1 text-[var(--el-flame-99)] hover:text-[var(--el-magenta)] active:text-[var(--el-green)] transition-colors"
            aria-label="Dismiss"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
