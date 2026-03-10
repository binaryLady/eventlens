// @TheTechMargin 2026
"use client";

import {
  useEffect,
  useState,
  useMemo,
  useCallback,
  useRef,
  Suspense,
} from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Image from "next/image";
import { PhotoRecord, PhotosResponse, MatchResult, MatchTier } from "@/lib/types";
import { searchPhotos } from "@/lib/photos";
import { config } from "@/lib/config";
import Lightbox from "@/components/Lightbox";
import Toast from "@/components/Toast";
import ErrorBoundary from "@/components/ErrorBoundary";
import PhotoUpload from "@/components/PhotoUpload";
import FloatingActionBar from "@/components/FloatingActionBar";

function timeAgo(dateStr: string): string {
  if (!dateStr) return "";
  const date = new Date(dateStr);
  const now = new Date();
  const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function isRecentlyUpdated(dateStr: string): boolean {
  if (!dateStr) return false;
  const date = new Date(dateStr);
  const now = new Date();
  return now.getTime() - date.getTime() < 5 * 60 * 1000;
}

function TerminalLoader() {
  const [lines, setLines] = useState<string[]>([]);
  const [showCursor, setShowCursor] = useState(true);

  const bootSequence = useMemo(
    () => [
      "> INITIALIZING EVENTLENS v2.0 ...",
      "> CONNECTING TO PHOTO DATABASE ...",
      "> LOADING DRIVE ASSETS ...",
      "> INDEXING VISUAL DATA ...",
      "> ACTIVATING FACE RECOGNITION MODULE ...",
      "> RENDERING GRID INTERFACE ...",
    ],
    [],
  );

  useEffect(() => {
    let i = 0;
    const interval = setInterval(() => {
      if (i < bootSequence.length) {
        setLines((prev) => [...prev, bootSequence[i]]);
        i++;
      } else {
        clearInterval(interval);
      }
    }, 350);
    return () => clearInterval(interval);
  }, [bootSequence]);

  useEffect(() => {
    const blink = setInterval(() => setShowCursor((c) => !c), 530);
    return () => clearInterval(blink);
  }, []);

  return (
    <div className="min-h-screen bg-[var(--el-bg)] grid-bg flex items-center justify-center p-4">
      <div className="w-full max-w-lg">
        {/* Terminal window */}
        <div className="border border-[var(--el-green-d9)] bg-[rgba(26,26,26,0.8)] p-6">
          {/* Terminal header bar */}
          <div className="flex items-center gap-2 border-b border-[var(--el-green-99)] pb-3 mb-4">
            <div className="h-2 w-2 rounded-full bg-[var(--el-green)]" />
            <div className="h-2 w-2 rounded-full bg-[var(--el-green-d9)]" />
            <div className="h-2 w-2 rounded-full bg-[var(--el-green-d9)]" />
            <span className="ml-2 text-[10px] uppercase tracking-widest text-[var(--el-green-d9)]">
              eventlens://boot
            </span>
          </div>

          {/* Boot text */}
          <div className="font-mono text-sm space-y-1">
            {lines.map((line, i) => (
              <div
                key={i}
                className="animate-boot-line text-[var(--el-green)] opacity-0"
                style={{ '--delay': `${i * 0.1}s` } as React.CSSProperties}
              >
                {line}
                {i < 2 && (
                  <span className="ml-2 text-[var(--el-green-d9)]">[OK]</span>
                )}
              </div>
            ))}
            {showCursor && (
              <span className="inline-block w-2 h-4 bg-[var(--el-green)] ml-1" />
            )}
          </div>

          {/* Scan line effect */}
          <div className="mt-6 h-1 w-full overflow-hidden bg-[var(--el-green-11)]">
            <div className="h-full w-1/3 bg-gradient-to-r from-transparent via-[var(--el-green)] to-transparent animate-[skeleton-scan_1.5s_linear_infinite]" />
          </div>
        </div>

        {/* Crosshair decoration */}
        <div className="mt-4 flex items-center justify-center gap-2 text-[10px] text-[var(--el-green-99)] uppercase tracking-widest">
          <span>&#x2500;&#x2500;&#x253c;&#x2500;&#x2500;</span>
          <span>LOADING</span>
          <span>&#x2500;&#x2500;&#x253c;&#x2500;&#x2500;</span>
        </div>
      </div>
    </div>
  );
}

function GridSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-2 md:grid-cols-3 lg:grid-cols-4">
      {Array.from({ length: 12 }).map((_, i) => (
        <div
          key={i}
          className="aspect-[4/3] border border-[var(--el-green-15)] skeleton-terminal"
          style={{ '--delay': `${i * 0.15}s` } as React.CSSProperties}
        >
          {/* Corner brackets */}
          <div className="relative h-full w-full p-2">
            <div className="absolute top-1 left-1 w-3 h-3 border-t border-l border-[var(--el-green-33)]" />
            <div className="absolute top-1 right-1 w-3 h-3 border-t border-r border-[var(--el-green-33)]" />
            <div className="absolute bottom-1 left-1 w-3 h-3 border-b border-l border-[var(--el-green-33)]" />
            <div className="absolute bottom-1 right-1 w-3 h-3 border-b border-r border-[var(--el-green-33)]" />
            {/* Center crosshair */}
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-[var(--el-green-22)] text-lg">+</span>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function PhotoGrid() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const [allPhotos, setAllPhotos] = useState<PhotoRecord[]>([]);
  const [folders, setFolders] = useState<string[]>([]);
  const [lastUpdated, setLastUpdated] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [selectedPhoto, setSelectedPhoto] = useState<PhotoRecord | null>(null);
  const [searchInput, setSearchInput] = useState(searchParams.get("q") || "");
  const [debouncedQuery, setDebouncedQuery] = useState(
    searchParams.get("q") || "",
  );
  const [serverResults, setServerResults] = useState<PhotoRecord[] | null>(null);
  const [activeFolder, setActiveFolderRaw] = useState(() => {
    const fromUrl = searchParams.get("folder");
    if (fromUrl) return fromUrl;
    if (typeof window !== "undefined") {
      return localStorage.getItem("eventlens:activeFolder") || "";
    }
    return "";
  });
  const [toast, setToast] = useState<{ message: string; count: number } | null>(
    null,
  );
  const [matchResults, setMatchResults] = useState<MatchResult[] | null>(null);
  const [matchDescription, setMatchDescription] = useState("");
  const [, setMatchTier] = useState<MatchTier>("text");
  const [activeType, setActiveType] = useState<"all" | "photo" | "video">("all");
  const [shuffledPhotos, setShuffledPhotos] = useState<PhotoRecord[]>([]);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [downloading, setDownloading] = useState(false);
  const [sortOrder, setSortOrderRaw] = useState<"shuffle" | "newest" | "oldest" | "name-asc" | "name-desc">(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("eventlens:sortOrder");
      if (saved === "shuffle" || saved === "newest" || saved === "oldest" || saved === "name-asc" || saved === "name-desc") {
        return saved;
      }
    }
    return "shuffle";
  });
  const pendingPhotosRef = useRef<PhotoRecord[] | null>(null);
  const debounceRef = useRef<NodeJS.Timeout>(undefined);

  const setActiveFolder = useCallback((folder: string) => {
    setActiveFolderRaw(folder);
    try { localStorage.setItem("eventlens:activeFolder", folder); } catch {}
  }, []);

  const setSortOrder = useCallback((order: "shuffle" | "newest" | "oldest" | "name-asc" | "name-desc") => {
    setSortOrderRaw(order);
    try { localStorage.setItem("eventlens:sortOrder", order); } catch {}
    if (order !== "shuffle") setBrowseAll(true);
  }, []);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch("/api/photos");
      if (!res.ok) throw new Error("Failed to fetch");
      const data: PhotosResponse = await res.json();
      return data;
    } catch {
      return null;
    }
  }, []);

  // Initial load
  useEffect(() => {
    fetchData().then((data) => {
      if (data) {
        setAllPhotos(data.photos);
        setFolders(data.folders);
        const shuffled = [...data.photos];
        for (let i = shuffled.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        }
        setShuffledPhotos(shuffled);
        setLastUpdated(data.lastUpdated);
        setLoading(false);

        // Deep-link: open photo from URL param
        const photoParam = searchParams.get("photo");
        if (photoParam) {
          const match = data.photos.find((p) => p.filename === photoParam);
          if (match) setSelectedPhoto(match);
        }
      } else {
        setError(true);
        setLoading(false);
      }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchData]);

  // Polling for new photos
  useEffect(() => {
    const interval = setInterval(async () => {
      const data = await fetchData();
      if (data && data.photos.length > allPhotos.length) {
        const diff = data.photos.length - allPhotos.length;
        pendingPhotosRef.current = data.photos;
        setToast({
          message: `${diff} new photo${diff === 1 ? "" : "s"} detected`,
          count: diff,
        });
        setFolders(data.folders);
        setLastUpdated(data.lastUpdated);
      } else if (data) {
        setFolders(data.folders);
        setLastUpdated(data.lastUpdated);
      }
    }, 30000);
    return () => clearInterval(interval);
  }, [allPhotos.length, fetchData]);

  // Debounced search
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setDebouncedQuery(searchInput);
    }, 250);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [searchInput]);

  // Server-side semantic search (Supabase full-text + trigram)
  useEffect(() => {
    if (!debouncedQuery || matchResults !== null) {
      setServerResults(null);
      return;
    }

    let cancelled = false;
    const params = new URLSearchParams({ q: debouncedQuery });
    if (activeFolder) params.set("folder", activeFolder);

    fetch(`/api/search?${params}`)
      .then((res) => res.json())
      .then((data: { results: PhotoRecord[]; source: string }) => {
        if (cancelled) return;
        if (data.results.length > 0) {
          setServerResults(data.results);
        } else {
          setServerResults(null);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setServerResults(null);
        }
      });

    return () => { cancelled = true; };
  }, [debouncedQuery, activeFolder, matchResults]);

  // Sync URL params (including selected photo for sharing)
  useEffect(() => {
    const params = new URLSearchParams();
    if (debouncedQuery) params.set("q", debouncedQuery);
    if (activeFolder) params.set("folder", activeFolder);
    if (selectedPhoto) params.set("photo", selectedPhoto.filename);
    const str = params.toString();
    router.replace(str ? `?${str}` : "/", { scroll: false });
  }, [debouncedQuery, activeFolder, selectedPhoto, router]);

  const handleMatchResults = useCallback(
    (data: { matches: MatchResult[]; description: string; tier?: MatchTier }) => {
      setMatchResults(data.matches);
      setMatchDescription(data.description);
      setMatchTier(data.tier || "text");
      setActiveFolder("");
    },
    [setActiveFolder],
  );

  const handleClearMatch = useCallback(() => {
    setMatchResults(null);
    setMatchDescription("");
    setActiveType("all");
  }, []);

  // ─── Multi-select handlers (no filteredPhotos dependency) ───
  const toggleSelectMode = useCallback(() => {
    setSelectMode((prev) => {
      if (prev) setSelectedIds(new Set());
      return !prev;
    });
  }, []);

  const togglePhotoSelection = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
    setSelectMode(false);
  }, []);

  const [browseAll, setBrowseAll] = useState(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("eventlens:sortOrder");
      return saved !== null && saved !== "shuffle";
    }
    return false;
  });
  const isSearchActive = debouncedQuery !== "" || activeFolder !== "" || matchResults !== null || browseAll || activeType !== "all";

  const applySorting = useCallback((photos: PhotoRecord[]): PhotoRecord[] => {
    if (sortOrder === "shuffle") return photos;
    const sorted = [...photos];
    switch (sortOrder) {
      case "newest":
        sorted.sort((a, b) => (b.processedAt || b.filename).localeCompare(a.processedAt || a.filename));
        break;
      case "oldest":
        sorted.sort((a, b) => (a.processedAt || a.filename).localeCompare(b.processedAt || b.filename));
        break;
      case "name-asc":
        sorted.sort((a, b) => a.filename.localeCompare(b.filename));
        break;
      case "name-desc":
        sorted.sort((a, b) => b.filename.localeCompare(a.filename));
        break;
    }
    return sorted;
  }, [sortOrder]);

  const isVideoFile = useCallback((p: PhotoRecord) =>
    p.mimeType?.startsWith("video/") || /\.(mp4|mov|webm|avi)$/i.test(p.filename), []);

  const applyTypeFilter = useCallback((photos: PhotoRecord[]) => {
    if (activeType === "video") return photos.filter(isVideoFile);
    if (activeType === "photo") return photos.filter((p) => !isVideoFile(p));
    return photos;
  }, [activeType, isVideoFile]);

  const filteredPhotos = useMemo(() => {
    let result: PhotoRecord[];
    if (matchResults !== null) {
      const matchPhotos = matchResults.map((m) => m.photo);
      result = debouncedQuery ? searchPhotos(debouncedQuery, matchPhotos) : matchPhotos;
    } else if (debouncedQuery) {
      if (serverResults && serverResults.length > 0) {
        result = serverResults;
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
    return applyTypeFilter(result);
  }, [allPhotos, shuffledPhotos, activeFolder, debouncedQuery, matchResults, serverResults, applySorting, sortOrder, applyTypeFilter]);

  const folderPreviews = useMemo(() => {
    const previews: Record<string, PhotoRecord[]> = {};
    for (const p of shuffledPhotos) {
      if (!previews[p.folder]) previews[p.folder] = [];
      if (previews[p.folder].length < 4) previews[p.folder].push(p);
    }
    return previews;
  }, [shuffledPhotos]);

  const heroPhotos = useMemo(() => {
    if (sortOrder === "shuffle") return shuffledPhotos.slice(0, 8);
    return applySorting(allPhotos).slice(0, 8);
  }, [shuffledPhotos, allPhotos, sortOrder, applySorting]);

  const matchInfoMap = useMemo(() => {
    if (!matchResults) return null;
    const map = new Map<string, { confidence: number; tier: MatchTier }>();
    for (const m of matchResults) {
      map.set(m.photo.id, { confidence: m.confidence, tier: m.tier });
    }
    return map;
  }, [matchResults]);

  const folderCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const p of allPhotos) {
      counts[p.folder] = (counts[p.folder] || 0) + 1;
    }
    return counts;
  }, [allPhotos]);

  // ─── Multi-select handlers (depend on filteredPhotos) ───
  const selectAll = useCallback(() => {
    setSelectedIds(new Set(filteredPhotos.map((p) => p.id)));
  }, [filteredPhotos]);

  const handleDownloadZip = useCallback(async () => {
    if (selectedIds.size === 0) return;
    setDownloading(true);
    try {
      const files = filteredPhotos
        .filter((p) => selectedIds.has(p.id))
        .map((p) => ({ fileId: p.driveFileId, filename: p.filename }));

      const res = await fetch("/api/download-zip", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ files }),
      });

      if (!res.ok) throw new Error("Download failed");

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "eventlens_photos.zip";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      // Exit select mode after successful download
      clearSelection();
    } catch {
      setToast({ message: "ZIP DOWNLOAD FAILED — RETRY", count: 0 });
    } finally {
      setDownloading(false);
    }
  }, [selectedIds, filteredPhotos, clearSelection]);

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

  const handleRefresh = () => {
    if (pendingPhotosRef.current) {
      setAllPhotos(pendingPhotosRef.current);
      pendingPhotosRef.current = null;
    }
    setToast(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleLogout = async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      window.location.href = "/login";
    } catch {
      setToast({ message: "LOGOUT FAILED", count: 0 });
    }
  };

  return (
    <div className="min-h-screen bg-[var(--el-bg)] grid-bg">
      {/* Header */}
      <header className="px-3 pt-2 pb-2 md:px-4 md:pt-12 md:pb-8">
        <div className="mx-auto max-w-5xl">
          {/* Top bar with coordinates */}
          <div className="flex items-center justify-between mb-2 md:mb-4 text-[9px] md:text-[10px] text-[var(--el-green-d9)] uppercase tracking-widest font-mono">
            <span className="hidden sm:inline">SYS://PHOTO_RECON</span>
            <span className="sm:hidden">EVENTLENS</span>
            <div className="flex items-center gap-2 md:gap-4">
              <span className="hidden sm:inline">{allPhotos.length > 0 ? `${allPhotos.length} ASSETS INDEXED` : "STANDBY"}</span>
              <span className="sm:hidden">{allPhotos.length > 0 ? `${allPhotos.length}` : ""}</span>
              <button
                onClick={handleLogout}
                className="text-[var(--el-flame-99)] hover:text-[var(--el-magenta)] active:text-[var(--el-green)] transition-colors underline"
                title="Logout"
              >
                [LOGOUT]
              </button>
            </div>
          </div>

          {/* Title block */}
          <div className="border border-[var(--el-green-99)] px-3 py-2.5 md:p-8 relative">
            {/* Corner brackets */}
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

            {/* Search */}
            <div className="relative mt-2.5 md:mt-6 max-w-xl mx-auto">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--el-green-d9)] text-sm font-mono">
                {">_"}
              </span>
              <input
                type="text"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="SEARCH PHOTOS, PEOPLE, SCENES..."
                className="w-full border border-[var(--el-green-d9)] bg-[rgba(26,26,26,0.6)] py-2 md:py-3 pl-10 pr-10 text-base md:text-sm text-[var(--el-green)] font-mono placeholder-[var(--el-magenta)] outline-none transition-all focus:border-[var(--el-green)] focus:shadow-[0_0_15px_rgba(0,255,65,0.15)]"
                aria-label="Search photos"
                enterKeyHint="search"
              />
              {searchInput && (
                <button
                  onClick={() => setSearchInput("")}
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

            {/* Photo upload for face matching */}
            <PhotoUpload
              onMatchResults={handleMatchResults}
              onClear={handleClearMatch}
              isActive={matchResults !== null}
            />
          </div>
        </div>
      </header>

      {/* Filter bar — always visible when we have photos */}
      {!loading && !error && allPhotos.length > 0 && (
        <div className="mx-auto max-w-5xl px-3 md:px-4 pb-2 md:pb-4 space-y-1.5 md:space-y-2">
          {/* Desktop: folder tabs row */}
          {folders.length > 0 && (
            <div className="hidden md:block scrollbar-hide overflow-x-auto -mx-4 px-4">
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => setActiveFolder("")}
                  className={`shrink-0 px-2.5 py-1.5 text-xs font-mono uppercase tracking-wider transition-all ${
                    activeFolder === ""
                      ? "border border-[var(--el-magenta)] text-[var(--el-magenta)] bg-[var(--el-magenta-28)] glow-border-magenta"
                      : "border border-[var(--el-green-99)] text-[var(--el-green-99)] hover:border-[var(--el-magenta)] hover:text-[var(--el-magenta)]"
                  }`}
                >
                  ALL [{allPhotos.length}]
                </button>
                {folders.map((folder) => (
                  <button
                    key={folder}
                    onClick={() =>
                      setActiveFolder(activeFolder === folder ? "" : folder)
                    }
                    className={`shrink-0 px-2.5 py-1.5 text-xs font-mono uppercase tracking-wider transition-all ${
                      activeFolder === folder
                        ? "border border-[var(--el-magenta)] text-[var(--el-magenta)] bg-[var(--el-magenta-28)] glow-border-magenta"
                        : "border border-[var(--el-green-99)] text-[var(--el-green-99)] hover:border-[var(--el-magenta)] hover:text-[var(--el-magenta)]"
                    }`}
                  >
                    {folder} [{folderCounts[folder] || 0}]
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Filter/sort + select row */}
          <div className="flex items-center justify-between gap-2">
            <FilterSortSheet
              sortOrder={sortOrder}
              onSortChange={setSortOrder}
              activeType={activeType}
              onTypeChange={setActiveType}
              folders={folders}
              folderCounts={folderCounts}
              activeFolder={activeFolder}
              onFolderChange={setActiveFolder}
              totalCount={allPhotos.length}
            />
            <button
              onClick={toggleSelectMode}
              className={`shrink-0 px-2.5 py-1.5 text-[10px] md:text-xs font-mono uppercase tracking-wider transition-all ${
                selectMode
                  ? "border border-[var(--el-magenta)] text-[var(--el-magenta)] bg-[var(--el-magenta-28)] glow-border-magenta"
                  : "border border-[var(--el-green-99)] text-[var(--el-green-99)] hover:border-[var(--el-magenta)] hover:text-[var(--el-magenta)]"
              }`}
            >
              {selectMode ? "EXIT" : "SELECT"}
            </button>
          </div>
        </div>
      )}

      {/* Results info */}
      {isSearchActive && (debouncedQuery || matchResults !== null) && (
        <div className="mx-auto max-w-5xl px-3 md:px-4 pb-2 md:pb-3">
          {!loading && !error && (
            <p className="text-[10px] font-mono uppercase tracking-widest text-[var(--el-green-99)]">
              {matchResults !== null ? (
                <>
                  {debouncedQuery ? (
                    <>{filteredPhotos.length} OF {matchResults.length} MATCH{matchResults.length !== 1 ? "ES" : ""} FOR &quot;{debouncedQuery.toUpperCase()}&quot;</>
                  ) : (
                    <>{matchResults.length} MATCH{matchResults.length !== 1 ? "ES" : ""}</>
                  )}
                  {matchResults.length > 0 && (() => {
                    const tiers = new Set(matchResults.map((m) => m.tier));
                    const parts: string[] = [];
                    if (tiers.has("text")) parts.push("TEXT");
                    if (tiers.has("visual")) parts.push("VISUAL");
                    if (tiers.has("vector")) parts.push("VECTOR");
                    if (tiers.has("both")) { parts.length = 0; parts.push("TEXT", "VISUAL"); }
                    return (
                      <span className="text-[var(--el-green)]">
                        {" // "}{parts.join(" + ")} SCAN
                      </span>
                    );
                  })()}
                  {matchDescription && (
                    <span className="text-[var(--el-green-d9)]">
                      {" // "}
                      {matchDescription}
                    </span>
                  )}
                </>
              ) : debouncedQuery ? (
                <>
                  {filteredPhotos.length} RESULT{filteredPhotos.length !== 1 ? "S" : ""} FOR &quot;{debouncedQuery.toUpperCase()}&quot;
                </>
              ) : (
                <>
                  {filteredPhotos.length} / {allPhotos.length} ASSETS
                </>
              )}
            </p>
          )}
        </div>
      )}

      {/* Main content */}
      <main className="mx-auto max-w-5xl px-3 pb-16 md:px-4 md:pb-12">
        {/* Loading state — terminal boot animation for grid */}
        {loading && <GridSkeleton />}

        {/* Error state */}
        {error && (
          <div className="flex flex-col items-center py-20 text-center border border-[#ff000033] bg-[#ff000008] p-8">
            <p className="text-xs font-mono uppercase tracking-wider text-red-500">
              &#9888; CONNECTION ERROR — VERIFY GOOGLE SHEET ACCESS
            </p>
            <button
              onClick={() => {
                setError(false);
                setLoading(true);
                fetchData().then((data) => {
                  if (data) {
                    setAllPhotos(data.photos);
                    setLastUpdated(data.lastUpdated);
                    setLoading(false);
                  } else {
                    setError(true);
                    setLoading(false);
                  }
                });
              }}
              className="mt-4 border border-[var(--el-green-99)] px-6 py-2 text-xs font-mono uppercase tracking-wider text-[var(--el-green-99)] hover:bg-[var(--el-magenta-28)] hover:border-[var(--el-magenta)] hover:text-[var(--el-magenta)] transition-all"
            >
              [RETRY CONNECTION]
            </button>
          </div>
        )}

        {/* Empty: no photos yet */}
        {!loading && !error && allPhotos.length === 0 && (
          <div className="flex flex-col items-center py-20 text-center border border-[var(--el-green-99)] p-8">
            <div className="text-4xl text-[var(--el-green-d9)] mb-4">+</div>
            <p className="text-xs font-mono uppercase tracking-wider text-[var(--el-green-99)]">
              {"NO ASSETS DETECTED // UPLOAD PHOTO TO BEGIN FACIAL SCAN"}
            </p>
          </div>
        )}

        {/* Browse landing (no search/filter active) */}
        {!loading && !error && allPhotos.length > 0 && !isSearchActive && (
          <>
            {/* Folder cards — visual grid for quick browse */}
            {folders.length > 1 && (
              <section className="mb-4 md:mb-8">
                <div className="flex items-center gap-2 mb-2 md:gap-3 md:mb-4">
                  <span className="text-[10px] font-mono uppercase tracking-widest text-[var(--el-green-99)]">
                    &#x2500;&#x2500; ALBUMS
                  </span>
                  <span className="text-[10px] font-mono uppercase tracking-widest text-[var(--el-green-d9)]">
                    [{folders.length}]
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-1.5 md:gap-2 md:grid-cols-3 lg:grid-cols-4">
                  {folders.map((folder) => {
                    const previews = folderPreviews[folder] || [];
                    const count = folderCounts[folder] || 0;
                    return (
                      <button
                        key={folder}
                        onClick={() => setActiveFolder(folder)}
                        className="group relative aspect-[4/3] overflow-hidden border border-[var(--el-green-22)] bg-[var(--el-bg)] cursor-pointer transition-all duration-200 hover:border-[var(--el-magenta)] hover:shadow-[0_0_20px_rgba(255,0,255,0.25)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--el-green)]"
                      >
                        {/* 2x2 thumbnail mosaic */}
                        <div className="absolute inset-0 grid grid-cols-2 grid-rows-2 gap-px bg-[var(--el-green-11)]">
                          {[0, 1, 2, 3].map((i) => (
                            <div key={i} className="relative overflow-hidden bg-[var(--el-bg)]">
                              {previews[i]?.thumbnailUrl ? (
                                <Image
                                  src={previews[i].thumbnailUrl}
                                  alt=""
                                  fill
                                  unoptimized
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

                        {/* Dark overlay + folder label */}
                        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/60 to-transparent flex flex-col items-center justify-end pb-3 md:pb-4">
                          <span className="text-[11px] md:text-xs font-mono font-bold uppercase tracking-wider text-[var(--el-green)] group-hover:glow-text-magenta transition-all">
                            {folder}
                          </span>
                          <span className="mt-0.5 md:mt-1 text-[9px] font-mono uppercase tracking-widest text-[var(--el-green-99)]">
                            {count} PHOTO{count !== 1 ? "S" : ""}
                          </span>
                        </div>

                        {/* Corner brackets */}
                        <div className="absolute top-1 left-1 w-2.5 h-2.5 border-t border-l border-[var(--el-green-44)] opacity-0 group-hover:opacity-100 transition-opacity" />
                        <div className="absolute bottom-1 right-1 w-2.5 h-2.5 border-b border-r border-[var(--el-green-44)] opacity-0 group-hover:opacity-100 transition-opacity" />
                      </button>
                    );
                  })}
                </div>
              </section>
            )}

            {/* Photo grid — show hero subset on landing */}
            {heroPhotos.length > 0 && (
              <section>
                <div className="flex items-center gap-2 md:gap-3 mb-2 md:mb-4">
                  <span className="text-[9px] md:text-[10px] font-mono uppercase tracking-widest text-[var(--el-green-99)]">
                    &#x2500;&#x2500; {sortOrder === "shuffle" ? "FEATURED" : sortOrder === "newest" ? "NEWEST" : sortOrder === "oldest" ? "OLDEST" : sortOrder === "name-asc" ? "NAME A\u2192Z" : "NAME Z\u2192A"}
                  </span>
                  <span className="text-[9px] md:text-[10px] font-mono uppercase tracking-widest text-[var(--el-green-d9)]">
                    [{allPhotos.length} TOTAL]
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-1.5 md:gap-2 md:grid-cols-3 lg:grid-cols-4">
                  {heroPhotos.map((photo, index) => (
                    <PhotoCard
                      key={photo.id}
                      photo={photo}
                      onClick={() => {
                        if (selectMode) {
                          togglePhotoSelection(photo.id);
                        } else {
                          setSelectedPhoto(photo);
                        }
                      }}
                      index={index}
                      selectMode={selectMode}
                      selected={selectedIds.has(photo.id)}
                    />
                  ))}
                </div>
                {/* Browse all prompt */}
                <div className="mt-4 md:mt-6 flex justify-center">
                  <button
                    onClick={() => setBrowseAll(true)}
                    className="inline-flex items-center gap-2 border border-[var(--el-green-99)] bg-[rgba(26,26,26,0.6)] px-5 py-2.5 text-[11px] md:text-xs font-mono uppercase tracking-wider text-[var(--el-green-99)] transition-all hover:border-[var(--el-magenta)] hover:text-[var(--el-magenta)] hover:shadow-[0_0_10px_rgba(255,0,255,0.25)] active:bg-[var(--el-green-99)]"
                  >
                    BROWSE ALL {allPhotos.length} PHOTOS
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="9 18 15 12 9 6" />
                    </svg>
                  </button>
                </div>
              </section>
            )}
          </>
        )}

        {/* Search/filter results */}
        {!loading && !error && isSearchActive && (
          <>
            {/* No search results */}
            {filteredPhotos.length === 0 && matchResults === null && (
              <div className="flex flex-col items-center py-20 text-center border border-[var(--el-green-99)] p-8">
                <p className="text-xs font-mono uppercase tracking-wider text-[var(--el-green-99)]">
                  NO MATCHES FOR &quot;{debouncedQuery.toUpperCase()}&quot; {"//"} TRY ALTERNATE QUERY
                </p>
              </div>
            )}

            {/* No face matches */}
            {matchResults !== null && matchResults.length === 0 && (
              <div className="flex flex-col items-center py-20 text-center border border-[var(--el-green-99)] p-8">
                <div className="text-4xl text-[var(--el-green-d9)] mb-4 animate-crosshair-spin">&#x2295;</div>
                <p className="text-xs font-mono uppercase tracking-wider text-[var(--el-green-99)]">
                  {"NO FACIAL MATCH DETECTED // TRY HIGHER RESOLUTION INPUT"}
                </p>
              </div>
            )}

            {/* Results grid */}
            {filteredPhotos.length > 0 && (
              <div className="grid grid-cols-2 gap-1.5 md:gap-2 md:grid-cols-3 lg:grid-cols-4">
                {filteredPhotos.map((photo, index) => (
                  <PhotoCard
                    key={photo.id}
                    photo={photo}
                    onClick={() => {
                      if (selectMode) {
                        togglePhotoSelection(photo.id);
                      } else {
                        setSelectedPhoto(photo);
                      }
                    }}
                    matchInfo={matchInfoMap?.get(photo.id)}
                    index={index}
                    selectMode={selectMode}
                    selected={selectedIds.has(photo.id)}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </main>

      {/* Footer */}
      {!loading && !error && allPhotos.length > 0 && (
        <footer className="border-t border-[var(--el-green-22)] px-4 py-6 text-center">
          <div className="flex items-center justify-center gap-4 text-[10px] font-mono uppercase tracking-widest text-[var(--el-green-d9)]">
            <span>&#x2500;&#x2500;&#x253c;&#x2500;&#x2500;</span>
            <span>
              {allPhotos.length} PHOTOS {"//"} {folders.length} FOLDER{folders.length !== 1 ? "S" : ""}
              {lastUpdated && <> {"//"} UPDATED {timeAgo(lastUpdated).toUpperCase()}</>}
            </span>
            <span>&#x2500;&#x2500;&#x253c;&#x2500;&#x2500;</span>
          </div>
        </footer>
      )}

      {/* Lightbox */}
      <Lightbox
        photo={selectedPhoto}
        photos={filteredPhotos}
        onClose={() => setSelectedPhoto(null)}
        onNavigate={setSelectedPhoto}
      />

      {/* Toast */}
      {toast && (
        <Toast
          message={toast.message}
          action={{ label: "SYNC", onClick: handleRefresh }}
          onDismiss={() => setToast(null)}
        />
      )}

      {/* Floating action bar for multi-select */}
      <FloatingActionBar
        selectedCount={selectedIds.size}
        totalCount={filteredPhotos.length}
        onSelectAll={selectAll}
        onClearSelection={clearSelection}
        onDownloadZip={handleDownloadZip}
        downloading={downloading}
      />
    </div>
  );
}



function FilterSortSheet({
  sortOrder,
  onSortChange,
  activeType,
  onTypeChange,
  folders,
  folderCounts,
  activeFolder,
  onFolderChange,
  totalCount,
}: {
  sortOrder: "shuffle" | "newest" | "oldest" | "name-asc" | "name-desc";
  onSortChange: (v: "shuffle" | "newest" | "oldest" | "name-asc" | "name-desc") => void;
  activeType: "all" | "photo" | "video";
  onTypeChange: (v: "all" | "photo" | "video") => void;
  folders?: string[];
  folderCounts?: Record<string, number>;
  activeFolder?: string;
  onFolderChange?: (v: string) => void;
  totalCount?: number;
}) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const hasActiveFilter = activeType !== "all" || sortOrder !== "shuffle";
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
      setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const sortOptions: { value: typeof sortOrder; label: string }[] = [
    { value: "shuffle", label: "SHUFFLE" },
    { value: "newest", label: "NEWEST" },
    { value: "oldest", label: "OLDEST" },
    { value: "name-asc", label: "NAME A\u2192Z" },
    { value: "name-desc", label: "NAME Z\u2192A" },
  ];

  const typeOptions: { value: typeof activeType; label: string }[] = [
    { value: "all", label: "ALL" },
    { value: "photo", label: "PHOTOS" },
    { value: "video", label: "VIDEOS" },
  ];

  const sortLabel = sortOptions.find((o) => o.value === sortOrder)?.label || "SORT";
  const typeLabel = activeType === "all" ? "" : activeType === "photo" ? "PHOTO" : "VIDEO";
  const chipLabel = [typeLabel, sortLabel].filter(Boolean).join(" / ") || "FILTER";

  const CheckIcon = () => (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="mr-2.5 shrink-0">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
  const Spacer = () => <span className="w-3 mr-2.5 shrink-0" />;

  const menuRow = (active: boolean, label: string, onClick: () => void) => (
    <button
      onClick={onClick}
      className={`flex items-center w-full text-left px-4 py-2.5 md:py-2 text-sm md:text-xs font-mono uppercase tracking-wider transition-all active:bg-[var(--el-green-11)] hover:bg-[var(--el-green-11)] ${
        active ? "text-[var(--el-magenta)]" : "text-[var(--el-green-99)]"
      }`}
    >
      {active ? <CheckIcon /> : <Spacer />}
      {label}
    </button>
  );

  const desktopContent = (
    <>
      <div className="px-4 pb-1 pt-1">
        <span className="text-[10px] font-mono uppercase tracking-widest text-[var(--el-green-99)]">TYPE</span>
      </div>
      {typeOptions.map((opt) => (
        <div key={opt.value}>{menuRow(activeType === opt.value, opt.label, () => onTypeChange(opt.value))}</div>
      ))}
      <div className="mx-4 my-1 border-t border-[var(--el-green-22)]" />
      <div className="px-4 pb-1 pt-1">
        <span className="text-[10px] font-mono uppercase tracking-widest text-[var(--el-green-99)]">SORT BY</span>
      </div>
      {sortOptions.map((opt) => (
        <div key={opt.value}>{menuRow(sortOrder === opt.value, opt.label, () => { onSortChange(opt.value); setOpen(false); })}</div>
      ))}
      <div className="h-2" />
    </>
  );

  const mobileContent = (
    <>
      {/* Folders (mobile only) */}
      {folders && folders.length > 0 && onFolderChange && (
        <>
          <div className="px-4 pb-1 pt-1">
            <span className="text-[10px] font-mono uppercase tracking-widest text-[var(--el-green-99)]">FOLDER</span>
          </div>
          {menuRow(activeFolder === "" || !activeFolder, `ALL [${totalCount || 0}]`, () => { onFolderChange(""); })}
          {folders.map((folder) =>
            <div key={folder}>{menuRow(activeFolder === folder, `${folder} [${folderCounts?.[folder] || 0}]`, () => { onFolderChange(activeFolder === folder ? "" : folder); })}</div>
          )}
          <div className="mx-4 my-1 border-t border-[var(--el-green-22)]" />
        </>
      )}

      {/* Type */}
      <div className="px-4 pb-1 pt-1">
        <span className="text-[10px] font-mono uppercase tracking-widest text-[var(--el-green-99)]">TYPE</span>
      </div>
      {typeOptions.map((opt) => (
        <div key={opt.value}>{menuRow(activeType === opt.value, opt.label, () => onTypeChange(opt.value))}</div>
      ))}

      <div className="mx-4 my-1 border-t border-[var(--el-green-22)]" />

      {/* Sort */}
      <div className="px-4 pb-1 pt-1">
        <span className="text-[10px] font-mono uppercase tracking-widest text-[var(--el-green-99)]">SORT BY</span>
      </div>
      {sortOptions.map((opt) => (
        <div key={opt.value}>{menuRow(sortOrder === opt.value, opt.label, () => { onSortChange(opt.value); setOpen(false); })}</div>
      ))}
      <div className="h-2" />
    </>
  );

  const mobileLabel = activeFolder
    ? activeFolder.replace(/_/g, " ")
    : hasActiveFilter ? "FILTER" : "FILTER";

  return (
    <div className="relative">
      <button
        ref={btnRef}
        onClick={() => setOpen((v) => !v)}
        className={`flex items-center gap-1.5 px-2.5 py-1.5 text-[10px] md:text-xs font-mono uppercase tracking-wider transition-all ${
          hasActiveFilter || hasFolderFilter
            ? "border border-[var(--el-magenta)] text-[var(--el-magenta)] bg-[var(--el-magenta-28)]"
            : "border border-[var(--el-green-99)] text-[var(--el-green-99)] hover:border-[var(--el-magenta)] hover:text-[var(--el-magenta)]"
        }`}
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 6h18M6 12h12M9 18h6" />
        </svg>
        <span className="md:hidden">{mobileLabel}</span>
        <span className="hidden md:inline">{chipLabel}</span>
        {(hasActiveFilter || hasFolderFilter) && (
          <span className="h-1.5 w-1.5 rounded-full bg-[var(--el-magenta)]" />
        )}
      </button>

      {/* Desktop: dropdown popover */}
      {open && (
        <div
          id="filter-popover"
          className="hidden md:block absolute top-full left-0 mt-1 z-50 min-w-[200px] border border-[var(--el-green-44)] bg-[var(--el-bg)] shadow-[0_4px_24px_rgba(0,0,0,0.5)]"
        >
          {desktopContent}
        </div>
      )}

      {/* Mobile: bottom sheet */}
      {open && (
        <div className="md:hidden fixed inset-0 z-50">
          <div className="absolute inset-0 bg-[rgba(26,26,26,0.8)] backdrop-blur-sm" onClick={() => setOpen(false)} />
          <div className="absolute bottom-0 left-0 right-0 max-h-[75vh] overflow-y-auto border-t border-[var(--el-green-99)] bg-[var(--el-bg)] animate-slide-up safe-bottom">
            <div className="flex justify-center pt-3 pb-1 sticky top-0 bg-[var(--el-bg)]">
              <div className="w-8 h-1 rounded-full bg-[var(--el-green-99)]" />
            </div>
            {mobileContent}
          </div>
        </div>
      )}
    </div>
  );
}

const TIER_LABELS: Record<MatchTier, string> = {
  text: "TXT",
  visual: "VIS",
  vector: "VEC",
  both: "TXT+VIS",
};

function PhotoCard({
  photo,
  onClick,
  matchInfo,
  index,
  selectMode,
  selected,
}: {
  photo: PhotoRecord;
  onClick: () => void;
  matchInfo?: { confidence: number; tier: MatchTier };
  index: number;
  selectMode: boolean;
  selected: boolean;
}) {
  const [imgError, setImgError] = useState(false);

  return (
    <button
      onClick={onClick}
      className={`group relative aspect-[4/3] overflow-hidden border bg-[var(--el-bg)] cursor-pointer transition-all duration-200 motion-safe:hover:scale-[1.02] hover:shadow-[0_0_20px_rgba(255,0,255,0.25)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--el-green)] animate-grid-reveal ${
        selected
          ? "border-[var(--el-green)] shadow-[0_0_15px_rgba(0,255,65,0.25)] ring-1 ring-[var(--el-green)]"
          : matchInfo && matchInfo.confidence >= 70
            ? "border-[var(--el-green)] shadow-[0_0_12px_rgba(0,255,65,0.2)]"
            : "border-[var(--el-green-22)] hover:border-[var(--el-magenta)]"
      }`}
      style={{ '--delay': `${index * 0.03}s` } as React.CSSProperties}
    >
      {imgError || !photo.thumbnailUrl ? (
        <div className="flex h-full w-full items-center justify-center bg-[var(--el-surface)]">
          <span className="text-[var(--el-green-22)] text-2xl">+</span>
        </div>
      ) : (
        <Image
          src={photo.thumbnailUrl}
          alt={photo.filename}
          fill
          unoptimized
          sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
          className={`object-cover transition-opacity ${
            selected ? "opacity-70" : "opacity-90 group-hover:opacity-100"
          }`}
          onError={() => setImgError(true)}
        />
      )}

      {/* Video play indicator */}
      {(photo.mimeType?.startsWith("video/") || /\.(mp4|mov|webm|avi)$/i.test(photo.filename)) && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[rgba(26,26,26,0.6)] border border-[var(--el-green-d9)]">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="var(--el-green)">
              <polygon points="8,5 20,12 8,19" />
            </svg>
          </div>
        </div>
      )}

      {/* Select mode checkbox overlay */}
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

      {/* Bottom overlay — hidden on hover so image is fully visible */}
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black via-black/70 to-transparent px-2 pb-2 pt-6 group-hover:opacity-0 transition-opacity">
        <span className="inline-block border border-[var(--el-green-d9)] bg-[rgba(26,26,26,0.8)] px-1.5 py-0.5 text-[9px] font-mono uppercase tracking-wider text-[var(--el-green-d9)]">
          {photo.folder}
        </span>
      </div>

      {/* Corner brackets */}
      <div className="absolute top-1 left-1 w-2.5 h-2.5 border-t border-l border-[var(--el-green-44)] opacity-0 group-hover:opacity-100 transition-opacity" />
      <div className="absolute bottom-1 right-1 w-2.5 h-2.5 border-b border-r border-[var(--el-green-44)] opacity-0 group-hover:opacity-100 transition-opacity" />

      {/* Match confidence + tier badge */}
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

export default function Home() {
  return (
    <ErrorBoundary>
      <Suspense fallback={<TerminalLoader />}>
        <PhotoGrid />
      </Suspense>
    </ErrorBoundary>
  );
}
