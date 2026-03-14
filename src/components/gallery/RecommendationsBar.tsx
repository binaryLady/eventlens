// @TheTechMargin 2026
"use client";

import { useMemo } from "react";
import { PhotoRecord } from "@/lib/types";
import PhotoCard from "./PhotoCard";

interface RecommendationsBarProps {
  recommendations: string[];
  allPhotos: PhotoRecord[];
  onPhotoClick: (photo: PhotoRecord) => void;
}

export default function RecommendationsBar({
  recommendations,
  allPhotos,
  onPhotoClick,
}: RecommendationsBarProps) {
  const recPhotos = useMemo(
    () => allPhotos.filter((p) => recommendations.includes(p.driveFileId)),
    [allPhotos, recommendations],
  );

  if (recPhotos.length === 0) return null;

  return (
    <section className="mt-6 md:mt-8">
      <div className="flex items-center gap-2 md:gap-3 mb-2 md:mb-4">
        <span className="text-[9px] md:text-[10px] font-mono uppercase tracking-widest" style={{ color: "var(--el-cyan)" }}>
          &#x2500;&#x2500; YOU MIGHT ALSO APPEAR IN
        </span>
      </div>
      <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2 md:gap-2 md:grid-cols-3 lg:grid-cols-4">
        {recPhotos.map((photo, index) => (
          <PhotoCard
            key={photo.id}
            photo={photo}
            onClick={() => onPhotoClick(photo)}
            index={index}
            selectMode={false}
            selected={false}
          />
        ))}
      </div>
    </section>
  );
}
