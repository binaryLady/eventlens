// @TheTechMargin 2026
"use client";

import { useEffect } from "react";

interface CollagePreviewProps {
  blobUrl: string;
  onDownload: () => void;
  onDismiss: () => void;
}

export default function CollagePreview({
  blobUrl,
  onDownload,
  onDismiss,
}: CollagePreviewProps) {
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
        className="relative flex flex-col items-center gap-4 p-4 max-w-[90vw] max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border border-[var(--el-green-44)] overflow-hidden">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={blobUrl}
            alt="Collage preview"
            className="max-w-full max-h-[75vh] object-contain"
          />
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={onDismiss}
            className="border border-[var(--el-green-99)] px-4 py-2 text-[10px] font-mono uppercase tracking-wider text-[var(--el-green-99)] hover:border-[var(--el-magenta)] hover:text-[var(--el-magenta)] transition-all"
          >
            CANCEL
          </button>
          <button
            onClick={onDownload}
            className="inline-flex items-center gap-2 border border-[var(--el-green-99)] bg-[var(--el-green-11)] px-4 py-2 text-[10px] font-mono uppercase tracking-wider text-[var(--el-green-99)] hover:bg-[var(--el-green-22)] transition-all"
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
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            DOWNLOAD
          </button>
        </div>

        <span className="text-[9px] font-mono uppercase tracking-wider text-[var(--el-green-44)]">
          ESC TO CLOSE
        </span>
      </div>
    </div>
  );
}
