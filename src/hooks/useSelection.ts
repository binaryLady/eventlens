// @TheTechMargin 2026
"use client";

import { useState, useCallback, useEffect } from "react";
import { PhotoRecord } from "@/lib/types";

export interface UseSelectionReturn {
  selectMode: boolean;
  selectedIds: Set<string>;
  toggleSelectMode: () => void;
  togglePhoto: (id: string) => void;
  selectAll: (photos: PhotoRecord[]) => void;
  clearSelection: () => void;
  setSelectMode: (v: boolean) => void;
}

export function useSelection(): UseSelectionReturn {
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const toggleSelectMode = useCallback(() => {
    setSelectMode((prev) => {
      if (prev) setSelectedIds(new Set());
      return !prev;
    });
  }, []);

  const togglePhoto = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const selectAll = useCallback((photos: PhotoRecord[]) => {
    setSelectedIds(new Set(photos.map((p) => p.id)));
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
    setSelectMode(false);
  }, []);

  // Escape key exits select mode
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && selectMode) {
        clearSelection();
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [selectMode, clearSelection]);

  return {
    selectMode,
    selectedIds,
    toggleSelectMode,
    togglePhoto,
    selectAll,
    clearSelection,
    setSelectMode,
  };
}
