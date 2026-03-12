// @TheTechMargin 2026
"use client";

import { useState, useMemo, useCallback } from "react";
import { PhotoRecord, MatchResult, MatchTier } from "@/lib/types";
import { searchPhotos } from "@/lib/photos";
import { isVideoFile } from "@/lib/utils";

export type SortOrder = "shuffle" | "name-asc" | "name-desc";

export interface UseFiltersReturn {
  activeFolder: string;
  setActiveFolder: (f: string) => void;
  activeTag: string | null;
  setActiveTag: (t: string | null) => void;
  activeType: "all" | "photo" | "video";
  setActiveType: (t: "all" | "photo" | "video") => void;
  minFaces: number;
  setMinFaces: (n: number) => void;
  sortOrder: SortOrder;
  setSortOrder: (s: SortOrder) => void;
  browseAll: boolean;
  setBrowseAll: (b: boolean) => void;
  filteredPhotos: PhotoRecord[];
  folderCounts: Record<string, number>;
  tagCounts: Record<string, number>;
  clearFilters: () => void;
  isSearchActive: boolean;
  matchInfoMap: Map<string, { confidence: number; tier: MatchTier }> | null;
}

export function useFilters(
  allPhotos: PhotoRecord[],
  shuffledPhotos: PhotoRecord[],
  debouncedQuery: string,
  serverResults: PhotoRecord[] | null,
  matchResults: MatchResult[] | null,
): UseFiltersReturn {
  const [activeFolder, setActiveFolderRaw] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("eventlens:activeFolder") || "";
    }
    return "";
  });
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [activeType, setActiveType] = useState<"all" | "photo" | "video">("all");
  const [minFaces, setMinFaces] = useState(0);
  const [sortOrder, setSortOrderRaw] = useState<SortOrder>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("eventlens:sortOrder");
      if (saved === "shuffle" || saved === "name-asc" || saved === "name-desc") {
        return saved;
      }
    }
    return "shuffle";
  });
  const [browseAll, setBrowseAll] = useState(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("eventlens:sortOrder");
      return saved !== null && saved !== "shuffle";
    }
    return false;
  });

  const setActiveFolder = useCallback((folder: string) => {
    setActiveFolderRaw(folder);
    try { localStorage.setItem("eventlens:activeFolder", folder); } catch {}
  }, []);

  const setSortOrder = useCallback((order: SortOrder) => {
    setSortOrderRaw(order);
    try { localStorage.setItem("eventlens:sortOrder", order); } catch {}
    if (order !== "shuffle") {
      setBrowseAll(true);
    }
  }, []);

  const applySorting = useCallback((photos: PhotoRecord[]): PhotoRecord[] => {
    if (sortOrder === "shuffle") return photos;
    const sorted = [...photos];
    switch (sortOrder) {
      case "name-asc":
        sorted.sort((a, b) => a.filename.localeCompare(b.filename));
        break;
      case "name-desc":
        sorted.sort((a, b) => b.filename.localeCompare(a.filename));
        break;
    }
    return sorted;
  }, [sortOrder]);

  const applyTypeFilter = useCallback((photos: PhotoRecord[]) => {
    let result = photos;
    if (activeType === "video") result = result.filter(isVideoFile);
    else if (activeType === "photo") result = result.filter((p) => !isVideoFile(p));
    if (minFaces > 0) {
      result = result.filter((p) => p.faceCount >= minFaces);
      result = [...result].sort((a, b) => a.faceCount - b.faceCount);
    }
    return result;
  }, [activeType, minFaces]);

  const isSearchActive = debouncedQuery !== "" || activeFolder !== "" || activeTag !== null || matchResults !== null || browseAll || activeType !== "all" || minFaces > 0;

  const filteredPhotos = useMemo(() => {
    let result: PhotoRecord[];
    if (matchResults !== null) {
      const matchPhotos = matchResults.map((m) => m.photo);
      result = debouncedQuery ? searchPhotos(debouncedQuery, matchPhotos) : matchPhotos;
    } else if (debouncedQuery) {
      if (serverResults && serverResults.length > 0) {
        result = activeFolder
          ? serverResults.filter((p) => p.folder === activeFolder)
          : serverResults;
      } else {
        const base = activeFolder
          ? allPhotos.filter((p) => p.folder === activeFolder)
          : allPhotos;
        result = applySorting(searchPhotos(debouncedQuery, base));
      }
    } else if (activeFolder) {
      const base = sortOrder === "shuffle" ? shuffledPhotos : allPhotos;
      result = applySorting(base.filter((p) => p.folder === activeFolder));
    } else {
      result = sortOrder === "shuffle" ? shuffledPhotos : applySorting(allPhotos);
    }
    if (activeTag) {
      result = result.filter((p) => p.autoTag === activeTag);
    }
    return applyTypeFilter(result);
  }, [allPhotos, shuffledPhotos, activeFolder, activeTag, debouncedQuery, matchResults, serverResults, applySorting, sortOrder, applyTypeFilter]);

  const folderCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const p of allPhotos) {
      counts[p.folder] = (counts[p.folder] || 0) + 1;
    }
    return counts;
  }, [allPhotos]);

  const tagCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const p of allPhotos) {
      if (p.autoTag) counts[p.autoTag] = (counts[p.autoTag] || 0) + 1;
    }
    return counts;
  }, [allPhotos]);

  const matchInfoMap = useMemo(() => {
    if (!matchResults) return null;
    const map = new Map<string, { confidence: number; tier: MatchTier }>();
    for (const m of matchResults) {
      map.set(m.photo.id, { confidence: m.confidence, tier: m.tier });
    }
    return map;
  }, [matchResults]);

  const clearFilters = useCallback(() => {
    setActiveFolder("");
    setActiveTag(null);
    setActiveType("all");
    setMinFaces(0);
    setSortOrder("shuffle");
  }, [setActiveFolder, setSortOrder]);

  return {
    activeFolder,
    setActiveFolder,
    activeTag,
    setActiveTag,
    activeType,
    setActiveType,
    minFaces,
    setMinFaces,
    sortOrder,
    setSortOrder,
    browseAll,
    setBrowseAll,
    filteredPhotos,
    folderCounts,
    tagCounts,
    clearFilters,
    isSearchActive,
    matchInfoMap,
  };
}
