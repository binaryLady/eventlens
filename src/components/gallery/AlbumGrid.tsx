// @TheTechMargin 2026
"use client";

import { useMemo } from "react";
import Image from "next/image";
import { PhotoRecord } from "@/lib/types";

interface AlbumGridProps {
  folders: string[];
  photos: PhotoRecord[];
  folderCounts: Record<string, number>;
  onSelect: (folder: string) => void;
}

export default function AlbumGrid({
  folders,
  photos,
  folderCounts,
  onSelect,
}: AlbumGridProps) {
  const folderPreviews = useMemo(() => {
    const previews: Record<string, PhotoRecord[]> = {};
    for (const p of photos) {
      if (!previews[p.folder]) previews[p.folder] = [];
      if (previews[p.folder].length < 4) previews[p.folder].push(p);
    }
    return previews;
  }, [photos]);

  if (folders.length <= 1) return null;

  return (
    <section className="mb-4 md:mb-8">
      <div className="flex items-center gap-2 mb-2 md:gap-3 md:mb-4">
        <span className="text-[10px] font-mono uppercase tracking-widest text-[var(--el-green-99)]">
          &#x2500;&#x2500; ALBUMS
        </span>
        <span className="text-[10px] font-mono uppercase tracking-widest text-[var(--el-green-d9)]">
          [{folders.length}]
        </span>
      </div>
      <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2 md:gap-2 md:grid-cols-3 lg:grid-cols-4">
        {folders.map((folder) => {
          const previews = folderPreviews[folder] || [];
          const count = folderCounts[folder] || 0;
          return (
            <button
              key={folder}
              onClick={() => onSelect(folder)}
              className="group relative aspect-[4/3] overflow-hidden border border-[var(--el-green-22)] bg-[var(--el-bg)] cursor-pointer transition-all duration-200 hover:border-[var(--el-magenta)] hover:shadow-[0_0_20px_rgba(255,0,255,0.25)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--el-green)]"
            >
              <div className="absolute inset-0 grid grid-cols-2 grid-rows-2 gap-px bg-[var(--el-green-11)]">
                {[0, 1, 2, 3].map((i) => (
                  <div key={i} className="relative overflow-hidden bg-[var(--el-bg)]">
                    {previews[i]?.thumbnailUrl ? (
                      <Image
                        src={previews[i].thumbnailUrl}
                        alt=""
                        fill
                        sizes="80px"
                        className="object-cover opacity-50 group-hover:opacity-70 transition-opacity"
                      />
                    ) : (
                      <div className="h-full w-full flex items-center justify-center">
                        <span className="text-[var(--el-green-11)] text-lg">+</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>

              <div className="absolute inset-0 bg-gradient-to-t from-black via-black/60 to-transparent flex flex-col items-center justify-end pb-3 md:pb-4">
                <span className="text-[11px] md:text-xs font-mono font-bold uppercase tracking-wider text-[var(--el-green)] group-hover:glow-text-magenta transition-all">
                  {folder}
                </span>
                <span className="mt-0.5 md:mt-1 text-[9px] font-mono uppercase tracking-widest text-[var(--el-green-99)]">
                  {count} PHOTO{count !== 1 ? "S" : ""}
                </span>
              </div>

              <div className="absolute top-1 left-1 w-2.5 h-2.5 border-t border-l border-[var(--el-green-44)] opacity-0 group-hover:opacity-100 transition-opacity" />
              <div className="absolute bottom-1 right-1 w-2.5 h-2.5 border-b border-r border-[var(--el-green-44)] opacity-0 group-hover:opacity-100 transition-opacity" />
            </button>
          );
        })}
      </div>
    </section>
  );
}
