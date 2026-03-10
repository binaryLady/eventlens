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
    <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-[#00ff41] bg-black animate-slide-up">
      <div className="mx-auto max-w-5xl flex items-center justify-between px-4 py-3 gap-3">
        {/* Left: Cancel */}
        <button
          onClick={onClearSelection}
          className="shrink-0 border border-[#00ff4133] px-3 py-1.5 text-[10px] font-mono uppercase tracking-wider text-[#00ff4166] hover:border-[#00ff41] hover:text-[#00ff41] transition-all"
        >
          CANCEL
        </button>

        {/* Center: Count */}
        <span className="text-xs font-mono uppercase tracking-wider text-[#00ff41] whitespace-nowrap">
          {selectedCount} {"/"} {totalCount} SELECTED
        </span>

        {/* Right: Actions */}
        <div className="flex items-center gap-2">
          {selectedCount < totalCount && (
            <button
              onClick={onSelectAll}
              className="hidden sm:block shrink-0 border border-[#00ff4133] px-3 py-1.5 text-[10px] font-mono uppercase tracking-wider text-[#00ff4166] hover:border-[#00ff41] hover:text-[#00ff41] transition-all"
            >
              SELECT ALL
            </button>
          )}
          <button
            onClick={onDownloadZip}
            disabled={downloading}
            className="shrink-0 inline-flex items-center gap-2 border border-[#00ff41] bg-[#00ff4111] px-4 py-1.5 text-xs font-mono uppercase tracking-wider text-[#00ff41] hover:bg-[#00ff4122] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {downloading ? (
              <>
                <div className="relative w-3 h-3">
                  <div className="absolute inset-0 border border-[#00ff41] animate-crosshair-spin" />
                </div>
                PACKAGING...
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
                DOWNLOAD ZIP
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
