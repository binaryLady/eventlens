// @TheTechMargin 2026
"use client";

import { PhotoRecord } from "@/lib/types";
import PhotoCard from "./PhotoCard";
import type { SortOrder } from "@/hooks/useFilters";

interface HeroSectionProps {
  photos: PhotoRecord[];
  totalCount: number;
  sortOrder: SortOrder;
  selectMode: boolean;
  selectedIds: Set<string>;
  hotPhotoIds: Set<string>;
  onPhotoClick: (photo: PhotoRecord) => void;
  onToggleSelect: (id: string) => void;
  onBrowseAll: () => void;
}

export default function HeroSection({
  photos,
  totalCount,
  sortOrder,
  selectMode,
  selectedIds,
  hotPhotoIds,
  onPhotoClick,
  onToggleSelect,
  onBrowseAll,
}: HeroSectionProps) {
  if (photos.length === 0) return null;

  return (
    <section>
      <div className="flex items-center gap-2 md:gap-3 mb-2 md:mb-4">
        <span className="text-[9px] md:text-[10px] font-mono uppercase tracking-widest text-[var(--el-green-99)]">
          &#x2500;&#x2500; {sortOrder === "shuffle" ? "FEATURED" : sortOrder === "name-asc" ? "NAME A\u2192Z" : "NAME Z\u2192A"}
        </span>
        <span className="text-[9px] md:text-[10px] font-mono uppercase tracking-widest text-[var(--el-green-d9)]">
          [{totalCount} TOTAL]
        </span>
      </div>
      <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2 md:gap-2 md:grid-cols-3 lg:grid-cols-4">
        {photos.map((photo, index) => (
          <PhotoCard
            key={photo.id}
            photo={photo}
            onClick={() => {
              if (selectMode) {
                onToggleSelect(photo.id);
              } else {
                onPhotoClick(photo);
              }
            }}
            index={index}
            selectMode={selectMode}
            selected={selectedIds.has(photo.id)}
            isHot={hotPhotoIds.has(photo.driveFileId)}
          />
        ))}
      </div>
      <div className="mt-4 md:mt-6 flex justify-center">
        <button
          onClick={onBrowseAll}
          className="inline-flex items-center gap-2 border border-[var(--el-green-99)] bg-[rgba(26,26,26,0.6)] px-5 py-2.5 text-[11px] md:text-xs font-mono uppercase tracking-wider text-[var(--el-green-99)] transition-all hover:border-[var(--el-magenta)] hover:text-[var(--el-magenta)] hover:shadow-[0_0_10px_rgba(255,0,255,0.25)] active:bg-[var(--el-green-99)]"
        >
          BROWSE ALL {totalCount} PHOTOS
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </button>
      </div>
    </section>
  );
}
