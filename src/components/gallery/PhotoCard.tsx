// @TheTechMargin 2026
"use client";

import React, { useState } from "react";
import Image from "next/image";
import { PhotoRecord, MatchTier } from "@/lib/types";

const TIER_LABELS: Record<MatchTier, string> = {
  text: "TXT",
  visual: "VIS",
  vector: "VEC",
  both: "TXT+VIS",
};

export interface PhotoCardProps {
  photo: PhotoRecord;
  onClick: () => void;
  matchInfo?: { confidence: number; tier: MatchTier };
  index: number;
  selectMode: boolean;
  selected: boolean;
  isHot?: boolean;
}

function PhotoCardInner({
  photo,
  onClick,
  matchInfo,
  index,
  selectMode,
  selected,
  isHot,
}: PhotoCardProps) {
  const [imgError, setImgError] = useState(false);
  const [imgLoaded, setImgLoaded] = useState(false);

  return (
    <button
      onClick={onClick}
      className={`group relative aspect-[4/3] overflow-hidden border bg-[var(--el-bg)] cursor-pointer transition-all duration-200 motion-safe:hover:scale-[1.02] hover:shadow-[0_0_20px_rgba(255,0,255,0.25)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--el-green)] ${index < 40 ? 'animate-grid-reveal' : ''} ${
        selected
          ? "border-[var(--el-green)] shadow-[0_0_15px_rgba(0,255,65,0.25)] ring-1 ring-[var(--el-green)]"
          : matchInfo && matchInfo.confidence >= 70
            ? "border-[var(--el-green)] shadow-[0_0_12px_rgba(0,255,65,0.2)]"
            : "border-[var(--el-green-22)] hover:border-[var(--el-magenta)]"
      }`}
      style={index < 40 ? { '--delay': `${index * 0.03}s` } as React.CSSProperties : undefined}
    >
      {imgError || !photo.thumbnailUrl ? (
        <div className="flex h-full w-full items-center justify-center bg-[var(--el-surface)]">
          <span className="text-[var(--el-green-22)] text-2xl">+</span>
        </div>
      ) : (
        <>
          {!imgLoaded && (
            <div className="absolute inset-0 bg-[var(--el-surface)] animate-pulse" />
          )}
          <Image
            src={photo.thumbnailUrl}
            alt={photo.filename}
            fill
            loading={index < 8 ? "eager" : "lazy"}
            {...(index < 8 ? { priority: true } : {})}
            className={`object-cover transition-opacity duration-300 ${
              !imgLoaded ? "opacity-0" : selected ? "opacity-70" : "opacity-100"
            }`}
            onLoad={() => setImgLoaded(true)}
            onError={() => setImgError(true)}
          />
        </>
      )}

      {(/\.(mp4|mov|webm|avi)$/i.test(photo.filename) ||
        photo.mimeType?.startsWith("video/")) && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-[5]">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[rgba(0,0,0,0.6)] border border-[var(--el-green-77)]">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="var(--el-green)" stroke="none">
              <polygon points="6,3 20,12 6,21" />
            </svg>
          </div>
        </div>
      )}

      {selectMode && (
        <div className="absolute top-1.5 left-1.5 z-10">
          <div
            className={`flex h-5 w-5 items-center justify-center border transition-all ${
              selected
                ? "border-[var(--el-green)] bg-[var(--el-green)]"
                : "border-[var(--el-green-99)] bg-[rgba(26,26,26,0.6)]"
            }`}
          >
            {selected && (
              <svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="black"
                strokeWidth="3"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <polyline points="20 6 9 17 4 12" />
              </svg>
            )}
          </div>
        </div>
      )}

      {!selectMode && isHot && !matchInfo && (
        <div className="absolute left-1.5 top-1.5">
          <span
            className="px-1.5 py-0.5 text-[8px] font-mono font-bold uppercase tracking-wider border"
            style={{
              borderColor: "var(--el-green)",
              backgroundColor: "rgba(26,26,26,0.8)",
              color: "var(--el-green)",
            }}
          >
            POPULAR
          </span>
        </div>
      )}

      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black via-black/70 to-transparent px-2 pb-2 pt-6 group-hover:opacity-0 transition-opacity">
        <span className="inline-block border border-[var(--el-green-d9)] bg-[rgba(26,26,26,0.8)] px-1.5 py-0.5 text-[9px] font-mono uppercase tracking-wider text-[var(--el-green-d9)]">
          {photo.folder}
        </span>
      </div>

      <div className="absolute inset-0 pointer-events-none z-[2] group-hover:opacity-0 transition-opacity duration-300 scan-line-bg" />

      <div className="absolute top-1 left-1 w-2.5 h-2.5 border-t border-l border-[var(--el-green-44)] opacity-0 group-hover:opacity-100 transition-opacity" />
      <div className="absolute bottom-1 right-1 w-2.5 h-2.5 border-b border-r border-[var(--el-green-44)] opacity-0 group-hover:opacity-100 transition-opacity" />

      {!selectMode && matchInfo ? (
        <div className="absolute right-1.5 top-1.5 flex items-center gap-0.5">
          <span
            className={`px-1 py-0.5 text-[8px] font-mono font-bold uppercase tracking-wider border ${
              matchInfo.tier === "both"
                ? "border-[var(--el-green)] bg-[rgba(26,26,26,0.8)] text-[var(--el-green)]"
                : matchInfo.tier === "visual" || matchInfo.tier === "vector"
                  ? "border-[var(--el-cyan-88)] bg-[rgba(26,26,26,0.8)] text-[var(--el-cyan)]"
                  : "border-[var(--el-amber-88)] bg-[rgba(26,26,26,0.8)] text-[var(--el-amber)]"
            }`}
          >
            {TIER_LABELS[matchInfo.tier]}
          </span>
          <span
            className={`px-1.5 py-0.5 text-[9px] font-mono font-bold uppercase tracking-wider ${
              matchInfo.confidence >= 70
                ? "bg-[var(--el-green)] text-black"
                : matchInfo.confidence >= 50
                  ? "bg-[var(--el-green-88)] text-black"
                  : "border border-[var(--el-green-99)] bg-[rgba(26,26,26,0.8)] text-[var(--el-green-d9)]"
            }`}
          >
            {matchInfo.confidence}%
          </span>
        </div>
      ) : (
        !selectMode &&
        photo.faceCount > 0 && (
          <div className="absolute right-1.5 top-1.5 flex items-center justify-center bg-[var(--el-green)] px-1.5 py-0.5 text-[9px] font-mono font-bold text-black">
            {photo.faceCount} {photo.faceCount === 1 ? "FACE" : "FACES"}
          </div>
        )
      )}
    </button>
  );
}

const PhotoCard = React.memo(PhotoCardInner, (prev, next) => {
  return (
    prev.photo.id === next.photo.id &&
    prev.selected === next.selected &&
    prev.selectMode === next.selectMode &&
    prev.matchInfo?.confidence === next.matchInfo?.confidence &&
    prev.isHot === next.isHot &&
    prev.index === next.index
  );
});

export default PhotoCard;
