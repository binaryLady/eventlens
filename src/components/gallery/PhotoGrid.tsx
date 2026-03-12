// @TheTechMargin 2026
"use client";

import { PhotoRecord, MatchTier } from "@/lib/types";
import PhotoCard from "./PhotoCard";

interface PhotoGridProps {
  photos: PhotoRecord[];
  selectMode: boolean;
  selectedIds: Set<string>;
  matchInfoMap: Map<string, { confidence: number; tier: MatchTier }> | null;
  hotPhotoIds: Set<string>;
  onPhotoClick: (photo: PhotoRecord) => void;
  onToggleSelect: (id: string) => void;
}

export default function PhotoGrid({
  photos,
  selectMode,
  selectedIds,
  matchInfoMap,
  hotPhotoIds,
  onPhotoClick,
  onToggleSelect,
}: PhotoGridProps) {
  return (
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
          matchInfo={matchInfoMap?.get(photo.id)}
          index={index}
          selectMode={selectMode}
          selected={selectedIds.has(photo.id)}
          isHot={hotPhotoIds.has(photo.driveFileId)}
        />
      ))}
    </div>
  );
}
