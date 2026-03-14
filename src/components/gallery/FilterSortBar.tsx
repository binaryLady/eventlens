// @TheTechMargin 2026
"use client";

import type { UseFiltersReturn } from "@/hooks/useFilters";

interface FilterSortBarProps {
  filters: UseFiltersReturn;
  children: React.ReactNode; // FilterSortSheet trigger
}

export default function FilterSortBar({ filters, children }: FilterSortBarProps) {
  const parts: string[] = [];
  if (filters.activeFolder) parts.push(filters.activeFolder.replace(/_/g, " "));
  if (filters.activeType !== "all") parts.push(filters.activeType === "photo" ? "PHOTOS" : "VIDEOS");
  if (filters.sortOrder !== "shuffle") {
    const sortLabels: Record<string, string> = { "name-asc": "A\u2192Z", "name-desc": "Z\u2192A" };
    parts.push(sortLabels[filters.sortOrder] || "");
  }
  if (filters.activeTag) parts.push(filters.activeTag);
  if (filters.minFaces > 0) parts.push(`${filters.minFaces}+ FACES`);

  return (
    <>
      {children}
      {parts.length > 0 && (
        <span
          className="flex-1 min-w-0 flex items-center gap-1.5 text-[9px] md:text-[10px] font-mono uppercase tracking-wider"
          style={{ color: "var(--el-cyan)" }}
        >
          <span className="truncate">{parts.join(" // ")}</span>
          <button
            onClick={(e) => {
              e.stopPropagation();
              filters.clearFilters();
            }}
            className="shrink-0 ml-0.5 w-4 h-4 flex items-center justify-center rounded-full border border-current opacity-60 hover:opacity-100 hover:bg-[var(--el-cyan-28)] transition-all"
            aria-label="Clear filters"
          >
            ×
          </button>
        </span>
      )}
    </>
  );
}
