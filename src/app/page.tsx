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
import { searchPhotos, getFolders } from "@/lib/photos";
import { config } from "@/lib/config";
import Lightbox from "@/components/Lightbox";
import Toast from "@/components/Toast";
import ErrorBoundary from "@/components/ErrorBoundary";
import PhotoUpload from "@/components/PhotoUpload";

function timeAgo(dateStr: string): string {
  if (!dateStr) return "";
  const date = new Date(dateStr);
  const now = new Date();
  const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

function isRecentlyUpdated(dateStr: string): boolean {
  if (!dateStr) return false;
  const date = new Date(dateStr);
  const now = new Date();
  return now.getTime() - date.getTime() < 5 * 60 * 1000;
}

function PhotoGrid() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const [allPhotos, setAllPhotos] = useState<PhotoRecord[]>([]);
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
  const [shuffledPhotos, setShuffledPhotos] = useState<PhotoRecord[]>([]);
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
        // Shuffle for random grid on each page load
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
          message: `${diff} new photo${diff === 1 ? "" : "s"} found`,
          count: diff,
        });
        setLastUpdated(data.lastUpdated);
      } else if (data) {
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

  const folders = useMemo(() => getFolders(allPhotos), [allPhotos]);

  const handleMatchResults = useCallback(
    (data: { matches: MatchResult[]; description: string }) => {
      setMatchResults(data.matches);
      setMatchDescription(data.description);
      // Clear text search when using face match
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

  const filteredPhotos = useMemo(() => {
    // Face match results — ranked by confidence
    if (matchResults !== null) {
      return matchResults.map((m) => m.photo);
    }
    // Text search — ranked by relevance
    if (debouncedQuery) {
      const base = activeFolder
        ? allPhotos.filter((p) => p.folder === activeFolder)
        : allPhotos;
      return searchPhotos(debouncedQuery, base);
    }
    // Folder filter on shuffled grid
    if (activeFolder) {
      return shuffledPhotos.filter((p) => p.folder === activeFolder);
    }
    // Default: random shuffled grid
    return shuffledPhotos;
  }, [allPhotos, shuffledPhotos, activeFolder, debouncedQuery, matchResults]);

  // Map of photo id -> match confidence for badge display
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

  const handleRefresh = () => {
    if (pendingPhotosRef.current) {
      setAllPhotos(pendingPhotosRef.current);
      pendingPhotosRef.current = null;
    }
    setToast(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <div className="min-h-screen bg-zinc-950">
      {/* Header */}
      <header className="px-4 pt-10 pb-6 text-center md:pt-16 md:pb-8">
        <div className="mx-auto max-w-2xl">
          <div className="flex items-center justify-center gap-3">
            <h1 className="font-heading text-4xl font-bold tracking-tight text-zinc-100 md:text-5xl lg:text-6xl">
              {config.eventName}
            </h1>
            {isRecentlyUpdated(lastUpdated) && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-400">
                <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                Photos updating live
              </span>
            )}
          </div>
          <p className="mt-2 text-lg text-zinc-400">{config.eventTagline}</p>

          {/* Search */}
          <div className="relative mt-6">
            <svg
              className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500"
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search by text on banners, clothing, or describe a scene..."
              className="w-full rounded-xl border border-zinc-800 bg-zinc-900 py-3.5 pl-12 pr-10 text-zinc-100 placeholder-zinc-500 outline-none transition-colors focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary)]/20"
              aria-label="Search photos"
              autoFocus
            />
            {searchInput && (
              <button
                onClick={() => setSearchInput("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-1 text-zinc-500 hover:text-zinc-300 transition-colors"
                aria-label="Clear search"
              >
                <svg
                  width="18"
                  height="18"
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
      </header>

      {/* Filter bar */}
      {folders.length > 0 && (
        <div className="scrollbar-hide mx-auto max-w-6xl overflow-x-auto px-4 pb-4">
          <div className="flex gap-2">
            <button
              onClick={() => setActiveFolder("")}
              className={`shrink-0 rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
                activeFolder === ""
                  ? "bg-[var(--color-primary)] text-white"
                  : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200"
              }`}
            >
              All Photos ({allPhotos.length})
            </button>
            {folders.map((folder) => (
              <button
                key={folder}
                onClick={() =>
                  setActiveFolder(activeFolder === folder ? "" : folder)
                }
                className={`shrink-0 rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
                  activeFolder === folder
                    ? "bg-[var(--color-primary)] text-white"
                    : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200"
                }`}
              >
                {folder} ({folderCounts[folder] || 0})
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Results info */}
      <div className="mx-auto max-w-6xl px-4 pb-4">
        {!loading && !error && (
          <p className="text-sm text-zinc-500">
            {matchResults !== null ? (
              <>
                {matchResults.length} face match
                {matchResults.length !== 1 ? "es" : ""} found
                {matchDescription && (
                  <span className="text-zinc-600">
                    {" "}
                    &mdash; {matchDescription}
                  </span>
                )}
              </>
            ) : debouncedQuery ? (
              <>
                {filteredPhotos.length} result
                {filteredPhotos.length !== 1 ? "s" : ""} for &ldquo;
                {debouncedQuery}&rdquo;
              </>
            ) : (
              <>
                Showing {filteredPhotos.length} of {allPhotos.length} photos
              </>
            )}
          </p>
        )}
      </div>

      {/* Main content */}
      <main className="mx-auto max-w-6xl px-4 pb-12">
        {/* Loading state */}
        {loading && (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
            {Array.from({ length: 12 }).map((_, i) => (
              <div
                key={i}
                className="aspect-[4/3] animate-pulse rounded-xl bg-zinc-800"
              />
            ))}
          </div>
        )}

        {/* Error state */}
        {error && (
          <div className="flex flex-col items-center py-20 text-center">
            <p className="text-zinc-400">
              Couldn&apos;t load photos. Check that the Google Sheet is shared
              publicly.
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
              className="mt-4 rounded-lg bg-[var(--color-primary)] px-6 py-2 text-sm font-medium text-white hover:opacity-90 transition-opacity"
            >
              Retry
            </button>
          </div>
        )}

        {/* Empty: no photos yet */}
        {!loading && !error && allPhotos.length === 0 && (
          <div className="flex flex-col items-center py-20 text-center">
            <svg
              className="mb-4 text-zinc-700"
              width="48"
              height="48"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
              <circle cx="8.5" cy="8.5" r="1.5" />
              <polyline points="21 15 16 10 5 21" />
            </svg>
            <p className="text-zinc-400">
              No photos found. Upload a photo above to find your matches.
            </p>
          </div>
        )}

        {/* Empty: no search results */}
        {!loading &&
          !error &&
          allPhotos.length > 0 &&
          filteredPhotos.length === 0 && (
            <div className="flex flex-col items-center py-20 text-center">
              <p className="text-zinc-400">
                No photos match &ldquo;{debouncedQuery}&rdquo;. Try searching
                for text you saw on signs or banners.
              </p>
            </div>
          )}

        {/* Empty: no face match results */}
        {!loading &&
          !error &&
          matchResults !== null &&
          matchResults.length === 0 && (
            <div className="flex flex-col items-center py-20 text-center">
              <svg
                className="mb-4 text-zinc-700"
                width="48"
                height="48"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                <circle cx="12" cy="7" r="4" />
              </svg>
              <p className="text-zinc-400">
                No matching faces found. Try uploading a clearer photo with good
                lighting.
              </p>
            </div>
          )}

        {/* Photo grid */}
        {!loading && !error && filteredPhotos.length > 0 && (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
            {filteredPhotos.map((photo) => (
              <PhotoCard
                key={photo.id}
                photo={photo}
                onClick={() => setSelectedPhoto(photo)}
                matchConfidence={matchConfidenceMap?.get(photo.id)}
              />
            ))}
          </div>
        )}
      </main>

      {/* Footer */}
      {!loading && !error && allPhotos.length > 0 && (
        <footer className="border-t border-zinc-800/50 px-4 py-8 text-center">
          <p className="text-sm text-zinc-500">
            Showing {allPhotos.length} photos from {folders.length} folder
            {folders.length !== 1 ? "s" : ""}
          </p>
          {lastUpdated && (
            <p className="mt-1 text-xs text-zinc-600">
              Last updated: {timeAgo(lastUpdated)}
            </p>
          )}
          <p className="mt-3 text-xs text-zinc-700">Powered by EventLens</p>
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
          action={{ label: "Refresh", onClick: handleRefresh }}
          onDismiss={() => setToast(null)}
        />
      )}
    </div>
  );
}

function PhotoCard({
  photo,
  onClick,
  matchConfidence,
}: {
  photo: PhotoRecord;
  onClick: () => void;
  matchConfidence?: number;
}) {
  const [imgError, setImgError] = useState(false);

  return (
    <button
      onClick={onClick}
      className={`group relative aspect-[4/3] overflow-hidden rounded-xl border bg-zinc-900 cursor-pointer transition-all duration-200 motion-safe:hover:scale-[1.02] hover:ring-2 hover:ring-[var(--color-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)] ${
        matchConfidence !== undefined && matchConfidence >= 70
          ? "border-emerald-500/50 ring-1 ring-emerald-500/20"
          : "border-zinc-800"
      }`}
    >
      {imgError || !photo.thumbnailUrl ? (
        <div className="flex h-full w-full items-center justify-center bg-zinc-800">
          <svg
            className="text-zinc-600"
            width="32"
            height="32"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
            <circle cx="8.5" cy="8.5" r="1.5" />
            <polyline points="21 15 16 10 5 21" />
          </svg>
        </div>
      ) : (
        <img
          src={photo.thumbnailUrl}
          alt={photo.filename}
          loading="lazy"
          className="h-full w-full object-cover"
          onError={() => setImgError(true)}
        />
      )}

      {/* Bottom overlay */}
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent px-2.5 pb-2.5 pt-8">
        <span className="inline-block rounded-full bg-zinc-800/80 px-2 py-0.5 text-[10px] font-medium text-zinc-300">
          {photo.folder}
        </span>
      </div>

      {/* Match confidence badge (when face matching is active) */}
      {matchConfidence !== undefined ? (
        <div
          className={`absolute right-2 top-2 flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ${
            matchConfidence >= 70
              ? "bg-emerald-500 text-white"
              : matchConfidence >= 50
                ? "bg-amber-500 text-zinc-900"
                : "bg-zinc-600 text-zinc-200"
          }`}
        >
          {matchConfidence}%
        </div>
      ) : (
        /* Face count badge (normal mode) */
        photo.faceCount > 0 && (
          <div className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-[var(--color-accent)] text-[10px] font-bold text-zinc-900">
            {photo.faceCount}
          </div>
        )
      )}
    </button>
  );
}

export default function Home() {
  return (
    <ErrorBoundary>
      <Suspense
        fallback={
          <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
            <div className="h-10 w-10 animate-spin rounded-full border-4 border-zinc-600 border-t-[var(--color-primary)]" />
          </div>
        }
      >
        <PhotoGrid />
      </Suspense>
    </ErrorBoundary>
  );
}
