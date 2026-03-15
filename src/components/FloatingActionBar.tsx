// @TheTechMargin 2026
"use client";

export type CollageRatio = "letterbox" | "portrait" | "square";

interface FloatingActionBarProps {
  selectedCount: number;
  totalCount: number;
  onSelectAll: () => void;
  onClearSelection: () => void;
  onDownloadZip: () => void;
  onMakeCollage: () => void;
  downloading: boolean;
  collagePending: boolean;
}

export default function FloatingActionBar({
  selectedCount,
  totalCount,
  onSelectAll,
  onClearSelection,
  onDownloadZip,
  onMakeCollage,
  downloading,
  collagePending,
}: FloatingActionBarProps) {
  if (selectedCount === 0) return null;

  const busy = downloading || collagePending;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-[var(--el-primary)] bg-[var(--el-bg)] animate-slide-up safe-bottom">
      <div className="mx-auto max-w-5xl flex items-center justify-between px-3 py-2.5 md:px-4 md:py-3 gap-2 md:gap-3">
        <button
          onClick={onClearSelection}
          className="shrink-0 border border-[var(--el-primary-99)] px-3 py-2 md:py-1.5 text-[10px] font-mono uppercase tracking-wider text-[var(--el-primary-99)] hover:border-[var(--el-accent)] hover:text-[var(--el-accent)] active:bg-[var(--el-primary-99)] transition-all"
        >
          CANCEL
        </button>

        <span className="text-[10px] md:text-xs font-mono uppercase tracking-wider text-[var(--el-primary)] whitespace-nowrap">
          {selectedCount} {"/"} {totalCount}
        </span>

        <div className="flex items-center gap-1.5 md:gap-2">
          {selectedCount < totalCount && (
            <button
              onClick={onSelectAll}
              className="hidden sm:block shrink-0 border border-[var(--el-primary-99)] px-3 py-2 md:py-1.5 text-[10px] font-mono uppercase tracking-wider text-[var(--el-primary-99)] hover:border-[var(--el-accent)] hover:text-[var(--el-accent)] active:bg-[var(--el-primary-99)] transition-all"
            >
              SELECT ALL
            </button>
          )}
          <button
            onClick={onMakeCollage}
            disabled={busy || selectedCount > 20}
            title={selectedCount > 20 ? "Max 20 photos" : undefined}
            className="shrink-0 inline-flex items-center gap-1.5 md:gap-2 border border-[var(--el-primary-99)] bg-[var(--el-primary-11)] px-3 md:px-4 py-2 md:py-1.5 text-[10px] md:text-xs font-mono uppercase tracking-wider text-[var(--el-primary-99)] active:bg-[var(--el-primary-22)] transition-all disabled:border-[var(--el-amber)]/20 disabled:text-[var(--el-amber)]/40 disabled:bg-transparent disabled:cursor-not-allowed"
          >
            {collagePending ? (
              <>
                <div className="relative w-3 h-3">
                  <div className="absolute inset-0 border border-[var(--el-primary)] animate-crosshair-spin" />
                </div>
                <span className="hidden sm:inline">MAKING...</span>
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
                  <rect x="3" y="3" width="7" height="7" />
                  <rect x="14" y="3" width="7" height="7" />
                  <rect x="3" y="14" width="7" height="7" />
                  <rect x="14" y="14" width="7" height="7" />
                </svg>
                <span className="hidden sm:inline">COLLAGE</span>
                <span className="sm:hidden">COL</span>
              </>
            )}
          </button>
          <button
            onClick={onDownloadZip}
            disabled={busy}
            className="shrink-0 inline-flex items-center gap-1.5 md:gap-2 border border-[var(--el-primary-99)] bg-[var(--el-primary-11)] px-3 md:px-4 py-2 md:py-1.5 text-[10px] md:text-xs font-mono uppercase tracking-wider text-[var(--el-primary-99)] active:bg-[var(--el-primary-22)] transition-all disabled:border-[var(--el-amber)]/20 disabled:text-[var(--el-amber)]/40 disabled:bg-transparent disabled:cursor-not-allowed"
          >
            {downloading ? (
              <>
                <div className="relative w-3 h-3">
                  <div className="absolute inset-0 border border-[var(--el-primary)] animate-crosshair-spin" />
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
