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
      className={`fixed bottom-6 left-1/2 z-40 -translate-x-1/2 transition-all duration-300 ${
        visible
          ? "translate-y-0 opacity-100"
          : "translate-y-4 opacity-0"
      }`}
    >
      <div className="flex items-center gap-3 border border-[#00ff4144] bg-black px-4 py-3 shadow-[0_0_20px_rgba(0,255,65,0.1)]">
        <span className="text-[10px] font-mono uppercase tracking-wider text-[#00ff41]">
          &#9679; {message.toUpperCase()}
        </span>
        {action && (
          <button
            onClick={action.onClick}
            className="border border-[#00ff41] px-3 py-1 text-[10px] font-mono uppercase tracking-wider text-[#00ff41] hover:bg-[#00ff4111] transition-all focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#00ff41]"
          >
            [{action.label}]
          </button>
        )}
        <button
          onClick={() => {
            setVisible(false);
            setTimeout(onDismiss, 300);
          }}
          className="ml-1 text-[#00ff4144] hover:text-[#00ff41] transition-colors"
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
  );
}
