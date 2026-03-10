// @TheTechMargin 2026
"use client";

interface FloatingActionBarProps {
  selectedCount: number;
  totalCount: number;
  onSelectAll: () => void;
  onClearSelection: () => void;
  onDownloadZip: () => void;
  downloading: boolean;
}

export default function FloatingActionBar({
  selectedCount,
  totalCount,
  onSelectAll,
  onClearSelection,
  onDownloadZip,
  downloading,
}: FloatingActionBarProps) {
  if (selectedCount === 0) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-[var(--el-green)] bg-black animate-slide-up safe-bottom">
      <div className="mx-auto max-w-5xl flex items-center justify-between px-3 py-2.5 md:px-4 md:py-3 gap-2 md:gap-3">
        {/* Left: Cancel */}
        <button
          onClick={onClearSelection}
          className="shrink-0 border border-[var(--el-green-99)] px-3 py-2 md:py-1.5 text-[10px] font-mono uppercase tracking-wider text-[var(--el-green-99)] hover:border-[var(--el-magenta)] hover:text-[var(--el-magenta)] active:bg-[var(--el-green-99)] transition-all"
        >
          CANCEL
        </button>

        {/* Center: Count */}
        <span className="text-[10px] md:text-xs font-mono uppercase tracking-wider text-[var(--el-green)] whitespace-nowrap">
          {selectedCount} {"/"} {totalCount}
        </span>

        {/* Right: Actions */}
        <div className="flex items-center gap-1.5 md:gap-2">
          {selectedCount < totalCount && (
            <button
              onClick={onSelectAll}
              className="hidden sm:block shrink-0 border border-[var(--el-green-99)] px-3 py-2 md:py-1.5 text-[10px] font-mono uppercase tracking-wider text-[var(--el-green-99)] hover:border-[var(--el-magenta)] hover:text-[var(--el-magenta)] active:bg-[var(--el-green-99)] transition-all"
            >
              SELECT ALL
            </button>
          )}
          <button
            onClick={onDownloadZip}
            disabled={downloading}
            className="shrink-0 inline-flex items-center gap-1.5 md:gap-2 border border-[var(--el-green-99)] bg-[var(--el-green-11)] px-3 md:px-4 py-2 md:py-1.5 text-[10px] md:text-xs font-mono uppercase tracking-wider text-[var(--el-green-99)] active:bg-[var(--el-green-22)] transition-all disabled:border-[var(--el-amber)]/20 disabled:text-[var(--el-amber)]/40 disabled:bg-transparent disabled:cursor-not-allowed"
          >
            {downloading ? (
              <>
                <div className="relative w-3 h-3">
                  <div className="absolute inset-0 border border-[var(--el-green)] animate-crosshair-spin" />
                </div>
                <span className="hidden sm:inline">PACKAGING...</span>
                <span className="sm:hidden">...</span>
              </>
            ) : (
              <>
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
                <span className="hidden sm:inline">DOWNLOAD ZIP</span>
                <span className="sm:hidden">ZIP</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
