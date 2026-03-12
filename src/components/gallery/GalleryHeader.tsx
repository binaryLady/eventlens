// @TheTechMargin 2026
"use client";

import { config } from "@/lib/config";
import { isRecentlyUpdated, timeAgo } from "@/lib/utils";
import PhotoUpload from "@/components/PhotoUpload";
import type { UseSearchReturn } from "@/hooks/useSearch";
import type { MatchResult, MatchTier } from "@/lib/types";

interface GalleryHeaderProps {
  search: UseSearchReturn;
  onRefresh: () => void;
  lastUpdated: string;
  totalPhotos: number;
  activeFolder: string;
  activeTag: string | null;
  activeType: "all" | "photo" | "video";
  onClearActiveFolder: () => void;
  onClearActiveTag: () => void;
}

export default function GalleryHeader({
  search,
  lastUpdated,
  totalPhotos,
  activeFolder,
  activeTag,
  activeType,
}: GalleryHeaderProps) {
  const handleLogout = async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      window.location.href = "/login";
    } catch {}
  };

  return (
    <header className="px-3 pt-2 pb-2 md:px-4 md:pt-12 md:pb-8">
      <div className="mx-auto max-w-5xl">
        <div className="flex items-center justify-between mb-2 md:mb-4 text-[9px] md:text-[10px] text-[var(--el-green-d9)] uppercase tracking-widest font-mono">
          <span className="hidden sm:inline">SYS://PHOTO_RECON</span>
          <span className="sm:hidden">EVENTLENS</span>
          <div className="flex items-center gap-2 md:gap-4">
            <span className="hidden sm:inline">{totalPhotos > 0 ? `${totalPhotos} ASSETS INDEXED` : "STANDBY"}</span>
            <span className="sm:hidden">{totalPhotos > 0 ? `${totalPhotos}` : ""}</span>
            <button
              onClick={handleLogout}
              className="text-[var(--el-flame-99)] hover:text-[var(--el-magenta)] active:text-[var(--el-green)] transition-colors underline"
              title="Logout"
            >
              [LOGOUT]
            </button>
          </div>
        </div>

        <div className="border border-[var(--el-green-99)] px-3 py-2.5 md:p-8 relative">
          <div className="absolute top-0 left-0 w-3 h-3 md:w-4 md:h-4 border-t-2 border-l-2 border-[var(--el-green)] -translate-x-px -translate-y-px" />
          <div className="absolute top-0 right-0 w-3 h-3 md:w-4 md:h-4 border-t-2 border-r-2 border-[var(--el-green)] translate-x-px -translate-y-px" />
          <div className="absolute bottom-0 left-0 w-3 h-3 md:w-4 md:h-4 border-b-2 border-l-2 border-[var(--el-green)] -translate-x-px translate-y-px" />
          <div className="absolute bottom-0 right-0 w-3 h-3 md:w-4 md:h-4 border-b-2 border-r-2 border-[var(--el-green)] translate-x-px translate-y-px" />

          <div className="text-center">
            <div className="flex items-center justify-center gap-2 md:gap-3">
              <h1 className="font-heading text-xl font-bold tracking-wider text-[var(--el-green)] uppercase glow-text sm:text-3xl md:text-5xl lg:text-6xl animate-flicker">
                {config.eventName}
              </h1>
            </div>
            <p className="mt-1 md:mt-2 text-[10px] md:text-xs uppercase tracking-[0.2em] md:tracking-[0.3em] text-[var(--el-green-d9)] font-mono">
              {isRecentlyUpdated(lastUpdated) && (
                <span className="inline-flex items-center gap-1 md:gap-1.5 border border-[var(--el-green-99)] px-1.5 md:px-2 py-0.5 text-[8px] md:text-[10px] font-mono uppercase tracking-wider text-[var(--el-green)]">
                  <span className="h-1 w-1 md:h-1.5 md:w-1.5 bg-[var(--el-green)] animate-pulse" />
                  Last updated: {timeAgo(lastUpdated)}
                </span>
              )}
            </p>
          </div>

          <div className="relative mt-2.5 md:mt-6 max-w-xl mx-auto">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--el-green-d9)] text-sm font-mono">
              {">_"}
            </span>
            <input
              type="text"
              value={search.searchInput}
              onChange={(e) => search.setSearchInput(e.target.value)}
              placeholder="SEARCH PHOTOS, PEOPLE, SCENES..."
              className="w-full border border-[var(--el-green-d9)] bg-[rgba(26,26,26,0.6)] py-2 md:py-3 pl-10 pr-10 text-base md:text-sm text-[var(--el-green)] font-mono placeholder-[var(--el-magenta)] outline-none transition-all focus:border-[var(--el-green)] focus:shadow-[0_0_15px_rgba(0,255,65,0.15)]"
              aria-label="Search photos"
              enterKeyHint="search"
            />
            {search.searchInput && (
              <button
                onClick={() => search.setSearchInput("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--el-green-d9)] hover:text-[var(--el-magenta)] transition-colors"
                aria-label="Clear search"
              >
                <svg
                  width="16"
                  height="16"
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
            )}
          </div>

          {(activeFolder || activeTag || activeType !== "all") && (
            <p className="mt-1.5 text-center text-[10px] font-mono uppercase tracking-wider text-[var(--el-amber)]">
              {[
                activeFolder ? `"${activeFolder}"` : "",
                activeTag ? `#${activeTag}` : "",
                activeType !== "all" ? `${activeType}s only` : "",
              ].filter(Boolean).join(" \u00b7 ")}
            </p>
          )}

          <PhotoUpload
            onMatchResults={(data: { matches: MatchResult[]; description: string; tier?: MatchTier; recommendations?: string[] }) => {
              search.handleMatchResults(data);
            }}
            onClear={search.handleClearMatch}
            isActive={search.matchResults !== null}
          />
        </div>
      </div>
    </header>
  );
}
