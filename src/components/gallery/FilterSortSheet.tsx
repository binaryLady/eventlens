// @TheTechMargin 2026
"use client";

import { useState, useEffect, useRef } from "react";
import type { SortOrder } from "@/hooks/useFilters";

interface FilterSortSheetProps {
  sortOrder: SortOrder;
  onSortChange: (v: SortOrder) => void;
  activeType: "all" | "photo" | "video";
  onTypeChange: (v: "all" | "photo" | "video") => void;
  minFaces: number;
  onMinFacesChange: (v: number) => void;
  folders?: string[];
  folderCounts?: Record<string, number>;
  activeFolder?: string;
  onFolderChange?: (v: string) => void;
  totalCount?: number;
}

export default function FilterSortSheet({
  sortOrder,
  onSortChange,
  activeType,
  onTypeChange,
  minFaces,
  onMinFacesChange,
  folders,
  folderCounts,
  activeFolder,
  onFolderChange,
  totalCount,
}: FilterSortSheetProps) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const hasActiveFilter = activeType !== "all" || sortOrder !== "shuffle" || minFaces > 0;
  const hasFolderFilter = !!activeFolder;

  useEffect(() => {
    if (!open) return;
    const isMobile = window.innerWidth < 768;
    if (isMobile) document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      if (btnRef.current?.contains(target)) return;
      const popover = document.getElementById("filter-popover");
      if (popover?.contains(target)) return;
      const mobileSheet = document.getElementById("filter-mobile-sheet");
      if (mobileSheet?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const sortOptions: { value: SortOrder; label: string }[] = [
    { value: "shuffle", label: "SHUFFLE" },
    { value: "name-asc", label: "NAME A\u2192Z" },
    { value: "name-desc", label: "NAME Z\u2192A" },
  ];

  const typeOptions: { value: typeof activeType; label: string }[] = [
    { value: "all", label: "ALL" },
    { value: "photo", label: "PHOTOS" },
    { value: "video", label: "VIDEOS" },
  ];

  const faceOptions = [
    { value: 0, label: "ANY" },
    { value: 1, label: "1+" },
    { value: 2, label: "2+" },
    { value: 3, label: "3+" },
    { value: 5, label: "5+" },
  ];

  const sortLabel = sortOptions.find((o) => o.value === sortOrder)?.label || "SORT";
  const typeLabel = activeType === "all" ? "" : activeType === "photo" ? "PHOTO" : "VIDEO";
  const faceLabel = minFaces > 0 ? `${minFaces}+ FACES` : "";
  const chipLabel = [typeLabel, faceLabel, sortLabel].filter(Boolean).join(" / ") || "FILTER";

  const CheckIcon = () => (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="mr-2.5 shrink-0">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
  const Spacer = () => <span className="w-3 mr-2.5 shrink-0" />;

  const menuRow = (active: boolean, label: string, onClick: () => void) => (
    <button
      onClick={onClick}
      className={`flex items-center w-full text-left px-4 py-2.5 md:py-2 text-sm md:text-xs font-mono uppercase tracking-wider transition-all active:bg-[var(--el-primary-11)] hover:bg-[var(--el-primary-11)] ${
        active ? "text-[var(--el-accent)]" : "text-[var(--el-primary-99)]"
      }`}
    >
      {active ? <CheckIcon /> : <Spacer />}
      {label}
    </button>
  );

  const desktopContent = (
    <>
      <div className="px-4 pb-1 pt-1">
        <span className="text-[10px] font-mono uppercase tracking-widest text-[var(--el-primary-99)]">TYPE</span>
      </div>
      {typeOptions.map((opt) => (
        <div key={opt.value}>{menuRow(activeType === opt.value, opt.label, () => onTypeChange(opt.value))}</div>
      ))}
      <div className="mx-4 my-1 border-t border-[var(--el-primary-22)]" />
      <div className="px-4 pb-1 pt-1">
        <span className="text-[10px] font-mono uppercase tracking-widest text-[var(--el-primary-99)]">FACES</span>
      </div>
      {faceOptions.map((opt) => (
        <div key={opt.value}>{menuRow(minFaces === opt.value, opt.label, () => { onMinFacesChange(opt.value); setOpen(false); })}</div>
      ))}
      <div className="mx-4 my-1 border-t border-[var(--el-primary-22)]" />
      <div className="px-4 pb-1 pt-1">
        <span className="text-[10px] font-mono uppercase tracking-widest text-[var(--el-primary-99)]">SORT BY</span>
      </div>
      {sortOptions.map((opt) => (
        <div key={opt.value}>{menuRow(sortOrder === opt.value, opt.label, () => { onSortChange(opt.value); setOpen(false); })}</div>
      ))}
      <div className="h-2" />
    </>
  );

  const mobileContent = (
    <>
      {folders && folders.length > 0 && onFolderChange && (
        <>
          <div className="px-4 pb-1 pt-1">
            <span className="text-[10px] font-mono uppercase tracking-widest text-[var(--el-primary-99)]">FOLDER</span>
          </div>
          {menuRow(activeFolder === "" || !activeFolder, `ALL [${totalCount || 0}]`, () => { onFolderChange(""); setOpen(false); })}
          {folders.map((folder) =>
            <div key={folder}>{menuRow(activeFolder === folder, `${folder} [${folderCounts?.[folder] || 0}]`, () => { onFolderChange(activeFolder === folder ? "" : folder); setOpen(false); })}</div>
          )}
          <div className="mx-4 my-1 border-t border-[var(--el-primary-22)]" />
        </>
      )}

      <div className="px-4 pb-1 pt-1">
        <span className="text-[10px] font-mono uppercase tracking-widest text-[var(--el-primary-99)]">TYPE</span>
      </div>
      {typeOptions.map((opt) => (
        <div key={opt.value}>{menuRow(activeType === opt.value, opt.label, () => { onTypeChange(opt.value); setOpen(false); })}</div>
      ))}

      <div className="mx-4 my-1 border-t border-[var(--el-primary-22)]" />

      <div className="px-4 pb-1 pt-1">
        <span className="text-[10px] font-mono uppercase tracking-widest text-[var(--el-primary-99)]">FACES</span>
      </div>
      {faceOptions.map((opt) => (
        <div key={opt.value}>{menuRow(minFaces === opt.value, opt.label, () => { onMinFacesChange(opt.value); setOpen(false); })}</div>
      ))}

      <div className="mx-4 my-1 border-t border-[var(--el-primary-22)]" />

      <div className="px-4 pb-1 pt-1">
        <span className="text-[10px] font-mono uppercase tracking-widest text-[var(--el-primary-99)]">SORT BY</span>
      </div>
      {sortOptions.map((opt) => (
        <div key={opt.value}>{menuRow(sortOrder === opt.value, opt.label, () => { onSortChange(opt.value); setOpen(false); })}</div>
      ))}
      <div className="h-2" />
    </>
  );

  const mobileLabel = activeFolder
    ? activeFolder.replace(/_/g, " ")
    : "FILTER";

  return (
    <div className="relative">
      <button
        ref={btnRef}
        onClick={() => setOpen((v) => !v)}
        className={`flex items-center gap-1.5 px-2.5 py-1.5 text-[10px] md:text-xs font-mono uppercase tracking-wider transition-all ${
          hasActiveFilter || hasFolderFilter
            ? "border border-[var(--el-accent)] text-[var(--el-accent)] bg-[var(--el-accent-28)]"
            : "border border-[var(--el-primary-99)] text-[var(--el-primary-99)] hover:border-[var(--el-accent)] hover:text-[var(--el-accent)]"
        }`}
      >
        {sortOrder === "shuffle" ? (
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="16 3 21 3 21 8" /><line x1="4" y1="20" x2="21" y2="3" /><polyline points="21 16 21 21 16 21" /><line x1="15" y1="15" x2="21" y2="21" /><line x1="4" y1="4" x2="9" y2="9" />
          </svg>
        ) : (
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 6h18M6 12h12M9 18h6" />
          </svg>
        )}
        <span className="md:hidden">{mobileLabel}</span>
        <span className="hidden md:inline">{chipLabel}</span>
        {(hasActiveFilter || hasFolderFilter) && (
          <span className="h-1.5 w-1.5 rounded-full bg-[var(--el-accent)]" />
        )}
      </button>

      {open && (
        <div
          id="filter-popover"
          className="hidden md:block absolute top-full left-0 mt-1 z-50 min-w-[200px] border border-[var(--el-primary-44)] bg-[var(--el-bg)] shadow-[0_4px_24px_rgba(0,0,0,0.5)]"
        >
          {desktopContent}
        </div>
      )}

      {open && (
        <div className="md:hidden fixed inset-0 z-50">
          <div className="absolute inset-0 bg-[rgba(26,26,26,0.8)] backdrop-blur-sm" onClick={() => setOpen(false)} />
          <div id="filter-mobile-sheet" className="absolute bottom-0 left-0 right-0 max-h-[75vh] overflow-y-auto border-t border-[var(--el-primary-99)] bg-[var(--el-bg)] animate-slide-up safe-bottom">
            <div className="flex justify-center pt-3 pb-1 sticky top-0 bg-[var(--el-bg)]">
              <div className="w-8 h-1 rounded-full bg-[var(--el-primary-99)]" />
            </div>
            {mobileContent}
          </div>
        </div>
      )}
    </div>
  );
}
