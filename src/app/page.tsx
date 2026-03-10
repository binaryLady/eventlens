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
import { PhotoRecord, PhotosResponse, MatchResult } from "@/lib/types";
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

/* ═══════════════════════════════════════════
   TERMINAL BOOT LOADING ANIMATION
   ═══════════════════════════════════════════ */
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
    <div className="min-h-screen bg-black grid-bg flex items-center justify-center p-4">
      <div className="w-full max-w-lg">
        {/* Terminal window */}
        <div className="border border-[#00ff4133] bg-black/80 p-6">
          {/* Terminal header bar */}
          <div className="flex items-center gap-2 border-b border-[#00ff4122] pb-3 mb-4">
            <div className="h-2 w-2 rounded-full bg-[#00ff41]" />
            <div className="h-2 w-2 rounded-full bg-[#00ff4166]" />
            <div className="h-2 w-2 rounded-full bg-[#00ff4133]" />
            <span className="ml-2 text-[10px] uppercase tracking-widest text-[#00ff4166]">
              eventlens://boot
            </span>
          </div>

          {/* Boot text */}
          <div className="font-mono text-sm space-y-1">
            {lines.map((line, i) => (
              <div
                key={i}
                className="animate-boot-line text-[#00ff41] opacity-0"
                style={{ animationDelay: `${i * 0.1}s` }}
              >
                {line}
                {i < 2 && (
                  <span className="ml-2 text-[#00ff4166]">[OK]</span>
                )}
              </div>
            ))}
            {showCursor && (
              <span className="inline-block w-2 h-4 bg-[#00ff41] ml-1" />
            )}
          </div>

          {/* Scan line effect */}
          <div className="mt-6 h-1 w-full overflow-hidden bg-[#00ff4111]">
            <div className="h-full w-1/3 bg-gradient-to-r from-transparent via-[#00ff41] to-transparent animate-[skeleton-scan_1.5s_linear_infinite]" />
          </div>
        </div>

        {/* Crosshair decoration */}
        <div className="mt-4 flex items-center justify-center gap-2 text-[10px] text-[#00ff4144] uppercase tracking-widest">
          <span>&#x2500;&#x2500;&#x253c;&#x2500;&#x2500;</span>
          <span>LOADING</span>
          <span>&#x2500;&#x2500;&#x253c;&#x2500;&#x2500;</span>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════
   GRID SKELETON LOADER (terminal-styled)
   ═══════════════════════════════════════════ */
function GridSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-2 md:grid-cols-3 lg:grid-cols-4">
      {Array.from({ length: 12 }).map((_, i) => (
        <div
          key={i}
          className="aspect-[4/3] border border-[#00ff4115] skeleton-terminal"
          style={{ animationDelay: `${i * 0.15}s` }}
        >
          {/* Corner brackets */}
          <div className="relative h-full w-full p-2">
            <div className="absolute top-1 left-1 w-3 h-3 border-t border-l border-[#00ff4133]" />
            <div className="absolute top-1 right-1 w-3 h-3 border-t border-r border-[#00ff4133]" />
            <div className="absolute bottom-1 left-1 w-3 h-3 border-b border-l border-[#00ff4133]" />
            <div className="absolute bottom-1 right-1 w-3 h-3 border-b border-r border-[#00ff4133]" />
            {/* Center crosshair */}
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-[#00ff4122] text-lg">+</span>
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
  const [activeFolder, setActiveFolder] = useState(
    searchParams.get("folder") || "",
  );
  const [toast, setToast] = useState<{ message: string; count: number } | null>(
    null,
  );
  const [matchResults, setMatchResults] = useState<MatchResult[] | null>(null);
  const [matchDescription, setMatchDescription] = useState("");
  const [matchTier, setMatchTier] = useState<"text" | "visual" | "both">("text");
  const [shuffledPhotos, setShuffledPhotos] = useState<PhotoRecord[]>([]);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [downloading, setDownloading] = useState(false);
  const pendingPhotosRef = useRef<PhotoRecord[] | null>(null);
  const debounceRef = useRef<NodeJS.Timeout>();

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
      } else {
        setError(true);
        setLoading(false);
      }
    });
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

  // Sync URL params
  useEffect(() => {
    const params = new URLSearchParams();
    if (debouncedQuery) params.set("q", debouncedQuery);
    if (activeFolder) params.set("folder", activeFolder);
    const str = params.toString();
    router.replace(str ? `?${str}` : "/", { scroll: false });
  }, [debouncedQuery, activeFolder, router]);

  const handleMatchResults = useCallback(
    (data: { matches: MatchResult[]; description: string; tier?: "text" | "visual" | "both" }) => {
      setMatchResults(data.matches);
      setMatchDescription(data.description);
      setMatchTier(data.tier || "text");
      setSearchInput("");
      setDebouncedQuery("");
      setActiveFolder("");
    },
    [],
  );

  const handleClearMatch = useCallback(() => {
    setMatchResults(null);
    setMatchDescription("");
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

  const filteredPhotos = useMemo(() => {
    if (matchResults !== null) {
      return matchResults.map((m) => m.photo);
    }
    if (debouncedQuery) {
      const base = activeFolder
        ? allPhotos.filter((p) => p.folder === activeFolder)
        : allPhotos;
      return searchPhotos(debouncedQuery, base);
    }
    if (activeFolder) {
      return shuffledPhotos.filter((p) => p.folder === activeFolder);
    }
    return shuffledPhotos;
  }, [allPhotos, shuffledPhotos, activeFolder, debouncedQuery, matchResults]);

  const matchConfidenceMap = useMemo(() => {
    if (!matchResults) return null;
    const map = new Map<string, number>();
    for (const m of matchResults) {
      map.set(m.photo.id, m.confidence);
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
    } catch (err) {
      console.error("ZIP download error:", err);
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

  return (
    <div className="min-h-screen bg-black grid-bg">
      {/* Header */}
      <header className="px-4 pt-8 pb-6 md:pt-12 md:pb-8">
        <div className="mx-auto max-w-5xl">
          {/* Top bar with coordinates */}
          <div className="flex items-center justify-between mb-4 text-[10px] text-[#00ff4144] uppercase tracking-widest font-mono">
            <span>SYS://PHOTO_RECON</span>
            <span>{allPhotos.length > 0 ? `${allPhotos.length} ASSETS INDEXED` : "STANDBY"}</span>
          </div>

          {/* Title block */}
          <div className="border border-[#00ff4122] p-6 md:p-8 relative">
            {/* Corner brackets */}
            <div className="absolute top-0 left-0 w-4 h-4 border-t-2 border-l-2 border-[#00ff41] -translate-x-px -translate-y-px" />
            <div className="absolute top-0 right-0 w-4 h-4 border-t-2 border-r-2 border-[#00ff41] translate-x-px -translate-y-px" />
            <div className="absolute bottom-0 left-0 w-4 h-4 border-b-2 border-l-2 border-[#00ff41] -translate-x-px translate-y-px" />
            <div className="absolute bottom-0 right-0 w-4 h-4 border-b-2 border-r-2 border-[#00ff41] translate-x-px translate-y-px" />

            <div className="text-center">
              <div className="flex items-center justify-center gap-3">
                <h1 className="font-heading text-4xl font-bold tracking-wider text-[#00ff41] uppercase glow-text md:text-5xl lg:text-6xl animate-flicker">
                  {config.eventName}
                </h1>
                {isRecentlyUpdated(lastUpdated) && (
                  <span className="inline-flex items-center gap-1.5 border border-[#00ff4144] px-2 py-0.5 text-[10px] font-mono uppercase tracking-wider text-[#00ff41]">
                    <span className="h-1.5 w-1.5 bg-[#00ff41] animate-pulse" />
                    LIVE
                  </span>
                )}
              </div>
              <p className="mt-2 text-xs uppercase tracking-[0.3em] text-[#00ff4166] font-mono">
                {config.eventTagline}
              </p>
            </div>

            {/* Search */}
            <div className="relative mt-6 max-w-xl mx-auto">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#00ff4166] text-sm font-mono">
                {">_"}
              </span>
              <input
                type="text"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="SEARCH VISUAL DATA..."
                className="w-full border border-[#00ff4133] bg-black/60 py-3 pl-10 pr-10 text-sm text-[#00ff41] font-mono placeholder-[#00ff4133] outline-none transition-all focus:border-[#00ff41] focus:shadow-[0_0_15px_rgba(0,255,65,0.15)]"
                aria-label="Search photos"
                autoFocus
              />
              {searchInput && (
                <button
                  onClick={() => setSearchInput("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[#00ff4166] hover:text-[#00ff41] transition-colors"
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

      {/* Filter bar */}
      {!loading && !error && allPhotos.length > 0 && (
        <div className="scrollbar-hide mx-auto max-w-5xl overflow-x-auto px-4 pb-4">
          <div className="flex items-center gap-1.5">
            {folders.length > 0 && (
              <>
                <button
                  onClick={() => setActiveFolder("")}
                  className={`shrink-0 px-3 py-1 text-xs font-mono uppercase tracking-wider transition-all ${
                    activeFolder === ""
                      ? "border border-[#00ff41] text-[#00ff41] bg-[#00ff4111] glow-border"
                      : "border border-[#00ff4122] text-[#00ff4166] hover:border-[#00ff4144] hover:text-[#00ff41]"
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
                    className={`shrink-0 px-3 py-1 text-xs font-mono uppercase tracking-wider transition-all ${
                      activeFolder === folder
                        ? "border border-[#00ff41] text-[#00ff41] bg-[#00ff4111] glow-border"
                        : "border border-[#00ff4122] text-[#00ff4166] hover:border-[#00ff4144] hover:text-[#00ff41]"
                    }`}
                  >
                    {folder} [{folderCounts[folder] || 0}]
                  </button>
                ))}
              </>
            )}

            {/* Select mode toggle */}
            <button
              onClick={toggleSelectMode}
              className={`shrink-0 ml-auto px-3 py-1 text-xs font-mono uppercase tracking-wider transition-all ${
                selectMode
                  ? "border border-[#00ff41] text-[#00ff41] bg-[#00ff4111] glow-border"
                  : "border border-[#00ff4122] text-[#00ff4166] hover:border-[#00ff4144] hover:text-[#00ff41]"
              }`}
            >
              {selectMode ? "EXIT SELECT" : "SELECT"}
            </button>
          </div>
        </div>
      )}

      {/* Results info */}
      <div className="mx-auto max-w-5xl px-4 pb-3">
        {!loading && !error && (
          <p className="text-[10px] font-mono uppercase tracking-widest text-[#00ff4155]">
            {matchResults !== null ? (
              <>
                {matchResults.length} MATCH{matchResults.length !== 1 ? "ES" : ""}
                {matchTier === "visual" && (
                  <span className="text-[#00ff41]">
                    {" // "}DEEP SCAN
                  </span>
                )}
                {matchTier === "both" && (
                  <span className="text-[#00ff41]">
                    {" // "}TEXT + VISUAL SCAN
                  </span>
                )}
                {matchDescription && (
                  <span className="text-[#00ff4133]">
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

      {/* Main content */}
      <main className="mx-auto max-w-5xl px-4 pb-12">
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
              className="mt-4 border border-[#00ff41] px-6 py-2 text-xs font-mono uppercase tracking-wider text-[#00ff41] hover:bg-[#00ff4111] transition-all"
            >
              [RETRY CONNECTION]
            </button>
          </div>
        )}

        {/* Empty: no photos yet */}
        {!loading && !error && allPhotos.length === 0 && (
          <div className="flex flex-col items-center py-20 text-center border border-[#00ff4122] p-8">
            <div className="text-4xl text-[#00ff4133] mb-4">+</div>
            <p className="text-xs font-mono uppercase tracking-wider text-[#00ff4155]">
              {"NO ASSETS DETECTED // UPLOAD PHOTO TO BEGIN FACIAL SCAN"}
            </p>
          </div>
        )}

        {/* Empty: no search results */}
        {!loading &&
          !error &&
          allPhotos.length > 0 &&
          filteredPhotos.length === 0 &&
          matchResults === null && (
            <div className="flex flex-col items-center py-20 text-center border border-[#00ff4122] p-8">
              <p className="text-xs font-mono uppercase tracking-wider text-[#00ff4155]">
                NO MATCHES FOR &quot;{debouncedQuery.toUpperCase()}&quot; {"//"} TRY ALTERNATE QUERY
              </p>
            </div>
          )}

        {/* Empty: no face match results */}
        {!loading &&
          !error &&
          matchResults !== null &&
          matchResults.length === 0 && (
            <div className="flex flex-col items-center py-20 text-center border border-[#00ff4122] p-8">
              <div className="text-4xl text-[#00ff4133] mb-4 animate-crosshair-spin">&#x2295;</div>
              <p className="text-xs font-mono uppercase tracking-wider text-[#00ff4155]">
                {"NO FACIAL MATCH DETECTED // TRY HIGHER RESOLUTION INPUT"}
              </p>
            </div>
          )}

        {/* Photo grid */}
        {!loading && !error && filteredPhotos.length > 0 && (
          <div className="grid grid-cols-2 gap-2 md:grid-cols-3 lg:grid-cols-4">
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
                matchConfidence={matchConfidenceMap?.get(photo.id)}
                index={index}
                selectMode={selectMode}
                selected={selectedIds.has(photo.id)}
              />
            ))}
          </div>
        )}
      </main>

      {/* Footer */}
      {!loading && !error && allPhotos.length > 0 && (
        <footer className="border-t border-[#00ff4115] px-4 py-6 text-center">
          <div className="flex items-center justify-center gap-4 text-[10px] font-mono uppercase tracking-widest text-[#00ff4133]">
            <span>&#x2500;&#x2500;&#x253c;&#x2500;&#x2500;</span>
            <span>
              {allPhotos.length} PHOTOS {"//"} {folders.length} FOLDER{folders.length !== 1 ? "S" : ""}
              {lastUpdated && <> {"//"} UPDATED {timeAgo(lastUpdated).toUpperCase()}</>}
            </span>
            <span>&#x2500;&#x2500;&#x253c;&#x2500;&#x2500;</span>
          </div>
          <p className="mt-2 text-[10px] font-mono tracking-wider text-[#00ff4122]">
            POWERED BY EVENTLENS
          </p>
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

function PhotoCard({
  photo,
  onClick,
  matchConfidence,
  index,
  selectMode,
  selected,
}: {
  photo: PhotoRecord;
  onClick: () => void;
  matchConfidence?: number;
  index: number;
  selectMode: boolean;
  selected: boolean;
}) {
  const [imgError, setImgError] = useState(false);

  return (
    <button
      onClick={onClick}
      className={`group relative aspect-[4/3] overflow-hidden border bg-black cursor-pointer transition-all duration-200 motion-safe:hover:scale-[1.02] hover:shadow-[0_0_20px_rgba(0,255,65,0.15)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#00ff41] animate-grid-reveal ${
        selected
          ? "border-[#00ff41] shadow-[0_0_15px_rgba(0,255,65,0.25)] ring-1 ring-[#00ff41]"
          : matchConfidence !== undefined && matchConfidence >= 70
            ? "border-[#00ff41] shadow-[0_0_12px_rgba(0,255,65,0.2)]"
            : "border-[#00ff4122] hover:border-[#00ff4166]"
      }`}
      style={{ animationDelay: `${index * 0.03}s` }}
    >
      {imgError || !photo.thumbnailUrl ? (
        <div className="flex h-full w-full items-center justify-center bg-[#0a0a0a]">
          <span className="text-[#00ff4122] text-2xl">+</span>
        </div>
      ) : (
        <img
          src={photo.thumbnailUrl}
          alt={photo.filename}
          loading="lazy"
          className={`h-full w-full object-cover transition-opacity ${
            selected ? "opacity-70" : "opacity-90 group-hover:opacity-100"
          }`}
          onError={() => setImgError(true)}
        />
      )}

      {/* Select mode checkbox overlay */}
      {selectMode && (
        <div className="absolute top-1.5 left-1.5 z-10">
          <div
            className={`flex h-5 w-5 items-center justify-center border transition-all ${
              selected
                ? "border-[#00ff41] bg-[#00ff41]"
                : "border-[#00ff4166] bg-black/60"
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

      {/* Bottom overlay */}
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black via-black/70 to-transparent px-2 pb-2 pt-6">
        <span className="inline-block border border-[#00ff4133] bg-black/80 px-1.5 py-0.5 text-[9px] font-mono uppercase tracking-wider text-[#00ff4199]">
          {photo.folder}
        </span>
      </div>

      {/* Top-left corner bracket */}
      <div className="absolute top-1 left-1 w-2.5 h-2.5 border-t border-l border-[#00ff4144] opacity-0 group-hover:opacity-100 transition-opacity" />
      <div className="absolute bottom-1 right-1 w-2.5 h-2.5 border-b border-r border-[#00ff4144] opacity-0 group-hover:opacity-100 transition-opacity" />

      {/* Match confidence badge */}
      {!selectMode && matchConfidence !== undefined ? (
        <div
          className={`absolute right-1.5 top-1.5 px-1.5 py-0.5 text-[9px] font-mono font-bold uppercase tracking-wider ${
            matchConfidence >= 70
              ? "bg-[#00ff41] text-black"
              : matchConfidence >= 50
                ? "bg-[#00ff4188] text-black"
                : "border border-[#00ff4144] bg-black/80 text-[#00ff4166]"
          }`}
        >
          {matchConfidence}%
        </div>
      ) : (
        !selectMode &&
        photo.faceCount > 0 && (
          <div className="absolute right-1.5 top-1.5 flex items-center justify-center bg-[#00ff41] px-1.5 py-0.5 text-[9px] font-mono font-bold text-black">
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
