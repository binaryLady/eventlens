"use client";

import { PhotoRecord } from "@/lib/types";
import { useEffect, useRef, useState, useCallback } from "react";

interface LightboxProps {
  photo: PhotoRecord | null;
  photos: PhotoRecord[];
  onClose: () => void;
  onNavigate: (photo: PhotoRecord) => void;
}

export default function Lightbox({
  photo,
  photos,
  onClose,
  onNavigate,
}: LightboxProps) {
  const [imageLoaded, setImageLoaded] = useState(false);
  const [touchStartX, setTouchStartX] = useState<number | null>(null);
  const [touchStartY, setTouchStartY] = useState<number | null>(null);
  const [swipeOffset, setSwipeOffset] = useState(0);
  const [showMeta, setShowMeta] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  const currentIndex = photo
    ? photos.findIndex((p) => p.id === photo.id)
    : -1;
  const hasPrev = currentIndex > 0;
  const hasNext = currentIndex < photos.length - 1;

  const goPrev = useCallback(() => {
    if (hasPrev) {
      onNavigate(photos[currentIndex - 1]);
    } else if (photos.length > 1) {
      onNavigate(photos[photos.length - 1]);
    }
  }, [hasPrev, currentIndex, photos, onNavigate]);

  const goNext = useCallback(() => {
    if (hasNext) {
      onNavigate(photos[currentIndex + 1]);
    } else if (photos.length > 1) {
      onNavigate(photos[0]);
    }
  }, [hasNext, currentIndex, photos, onNavigate]);

  useEffect(() => {
    if (!photo) return;

    setImageLoaded(false);
    setSwipeOffset(0);
    setShowMeta(false);

    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft") goPrev();
      if (e.key === "ArrowRight") goNext();
    };

    document.addEventListener("keydown", handleKey);
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", handleKey);
      document.body.style.overflow = "";
    };
  }, [photo, onClose, goPrev, goNext]);

  useEffect(() => {
    if (photo && closeRef.current) {
      closeRef.current.focus();
    }
  }, [photo]);

  const handleTouchStart = (e: React.TouchEvent) => {
    setTouchStartX(e.touches[0].clientX);
    setTouchStartY(e.touches[0].clientY);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (touchStartX === null || touchStartY === null) return;
    const dx = e.touches[0].clientX - touchStartX;
    const dy = e.touches[0].clientY - touchStartY;
    // Only track horizontal swipes (not vertical scroll)
    if (Math.abs(dx) > Math.abs(dy)) {
      setSwipeOffset(dx);
    }
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX === null) return;
    const dx = e.changedTouches[0].clientX - touchStartX;
    const dy = e.changedTouches[0].clientY - (touchStartY ?? 0);

    // Horizontal swipe for prev/next
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) {
      if (dx > 0) goPrev();
      else goNext();
    }
    // Downward swipe to close (mobile gesture)
    else if (dy > 100 && Math.abs(dy) > Math.abs(dx)) {
      onClose();
    }

    setTouchStartX(null);
    setTouchStartY(null);
    setSwipeOffset(0);
  };

  if (!photo) return null;

  const fullImageUrl = photo.driveFileId
    ? `https://lh3.googleusercontent.com/d/${photo.driveFileId}=w1600`
    : "";

  const hasMeta = !!(photo.visibleText || photo.peopleDescriptions || photo.sceneDescription || photo.faceCount > 0);

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-black/95 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-label="Photo viewer"
      ref={dialogRef}
    >
      {/* Scan line overlay */}
      <div className="absolute inset-0 pointer-events-none z-[51] opacity-30">
        <div className="w-full h-full" style={{
          backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,255,65,0.02) 2px, rgba(0,255,65,0.02) 4px)',
        }} />
      </div>

      {/* Top bar — safe area aware */}
      <div className="relative z-[52] flex items-center justify-between px-3 pt-safe-top md:px-4" style={{ paddingTop: 'max(0.75rem, env(safe-area-inset-top))' }}>
        {/* Counter */}
        {photos.length > 1 && (
          <span className="text-[10px] font-mono uppercase tracking-widest text-[#00ff4155]">
            {currentIndex + 1} / {photos.length}
          </span>
        )}
        {photos.length <= 1 && <span />}

        {/* Close */}
        <button
          ref={closeRef}
          onClick={onClose}
          className="flex h-10 w-10 items-center justify-center border border-[#00ff4133] bg-black text-[#00ff4199] hover:border-[#00ff41] hover:text-[#00ff41] active:bg-[#00ff4111] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#00ff41] transition-all"
          aria-label="Close lightbox"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      {/* Image area — takes remaining space */}
      <div
        className="relative flex-1 flex items-center justify-center min-h-0 px-2 md:px-16"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {/* Prev button — hidden on mobile (use swipe) */}
        {photos.length > 1 && (
          <button
            onClick={goPrev}
            className="hidden md:flex absolute left-2 top-1/2 z-[52] -translate-y-1/2 h-12 w-12 items-center justify-center border border-[#00ff4133] bg-black text-[#00ff4199] hover:border-[#00ff41] hover:text-[#00ff41] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#00ff41] transition-all md:left-4"
            aria-label="Previous photo"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>
        )}

        {/* Next button — hidden on mobile (use swipe) */}
        {photos.length > 1 && (
          <button
            onClick={goNext}
            className="hidden md:flex absolute right-2 top-1/2 z-[52] -translate-y-1/2 h-12 w-12 items-center justify-center border border-[#00ff4133] bg-black text-[#00ff4199] hover:border-[#00ff41] hover:text-[#00ff41] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#00ff41] transition-all md:right-4"
            aria-label="Next photo"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </button>
        )}

        {/* Image */}
        <div className="relative flex items-center justify-center w-full h-full">
          {!imageLoaded && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="flex flex-col items-center gap-2">
                <div className="relative w-8 h-8">
                  <div className="absolute inset-0 border border-[#00ff41] animate-crosshair-spin" />
                  <div className="absolute inset-2 bg-[#00ff41] animate-pulse" />
                </div>
                <span className="text-[10px] font-mono uppercase tracking-widest text-[#00ff4155]">
                  LOADING
                </span>
              </div>
            </div>
          )}
          {fullImageUrl && (
            <img
              src={fullImageUrl}
              alt={photo.filename}
              className="max-h-full max-w-full object-contain select-none"
              style={{
                boxShadow: imageLoaded ? '0 0 30px rgba(0,255,65,0.1)' : 'none',
                transform: swipeOffset ? `translateX(${swipeOffset * 0.3}px)` : undefined,
                transition: swipeOffset ? 'none' : 'transform 0.2s ease-out',
              }}
              draggable={false}
              onLoad={() => setImageLoaded(true)}
              onError={() => setImageLoaded(true)}
            />
          )}
        </div>
      </div>

      {/* Bottom bar — filename + actions, safe area aware */}
      <div className="relative z-[52] border-t border-[#00ff4122] bg-black" style={{ paddingBottom: 'max(0.5rem, env(safe-area-inset-bottom))' }}>
        {/* Swipe hint on mobile */}
        <div className="flex justify-center pt-1.5 pb-0.5 md:hidden">
          <div className="w-8 h-0.5 rounded-full bg-[#00ff4133]" />
        </div>

        <div className="px-3 py-2 md:px-6 md:py-3">
          {/* Main info row */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <h3 className="font-mono text-xs font-bold text-[#00ff41] uppercase tracking-wider truncate">
                {photo.filename}
              </h3>
              <span className="hidden sm:inline-block shrink-0 border border-[#00ff4133] px-1.5 py-0.5 text-[9px] font-mono uppercase tracking-wider text-[#00ff4199]">
                {photo.folder}
              </span>
              {photo.faceCount > 0 && (
                <span className="hidden sm:inline-block shrink-0 border border-[#00ff4122] px-1.5 py-0.5 text-[9px] font-mono text-[#00ff4166]">
                  {photo.faceCount} {photo.faceCount === 1 ? "FACE" : "FACES"}
                </span>
              )}
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {/* Info toggle on mobile */}
              {hasMeta && (
                <button
                  onClick={() => setShowMeta(!showMeta)}
                  className="md:hidden flex h-9 w-9 items-center justify-center border border-[#00ff4133] bg-black text-[#00ff4199] active:bg-[#00ff4111] transition-all"
                  aria-label="Toggle details"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10" />
                    <line x1="12" y1="16" x2="12" y2="12" />
                    <line x1="12" y1="8" x2="12.01" y2="8" />
                  </svg>
                </button>
              )}

              {/* Download */}
              <a
                href={photo.downloadUrl}
                className="inline-flex h-9 items-center gap-2 border border-[#00ff41] bg-[#00ff4111] px-3 text-xs font-mono uppercase tracking-wider text-[#00ff41] active:bg-[#00ff4122] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#00ff41] transition-all"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="7 10 12 15 17 10" />
                  <line x1="12" y1="15" x2="12" y2="3" />
                </svg>
                <span className="hidden sm:inline">DOWNLOAD</span>
              </a>
            </div>
          </div>

          {/* Mobile folder tag (below filename) */}
          <div className="flex items-center gap-2 mt-1.5 sm:hidden">
            <span className="border border-[#00ff4133] px-1.5 py-0.5 text-[9px] font-mono uppercase tracking-wider text-[#00ff4199]">
              {photo.folder}
            </span>
            {photo.faceCount > 0 && (
              <span className="border border-[#00ff4122] px-1.5 py-0.5 text-[9px] font-mono text-[#00ff4166]">
                {photo.faceCount} {photo.faceCount === 1 ? "FACE" : "FACES"}
              </span>
            )}
          </div>

          {/* Expandable metadata — desktop always, mobile toggle */}
          <div className={`overflow-hidden transition-all duration-200 ${showMeta ? "max-h-60 opacity-100 mt-3" : "md:max-h-60 md:opacity-100 md:mt-3 max-h-0 opacity-0"}`}>
            {photo.visibleText && (
              <div className="mb-2">
                <span className="text-[10px] font-mono uppercase tracking-widest text-[#00ff4144]">
                  {"// TEXT DETECTED"}
                </span>
                <p className="mt-0.5 border-l-2 border-[#00ff4133] pl-3 font-mono text-xs text-[#00ff4199] line-clamp-2">
                  {photo.visibleText}
                </p>
              </div>
            )}
            {photo.peopleDescriptions && (
              <div className="mb-2">
                <span className="text-[10px] font-mono uppercase tracking-widest text-[#00ff4144]">
                  {"// SUBJECTS"}
                </span>
                <p className="mt-0.5 text-xs font-mono text-[#00ff4199] line-clamp-2">
                  {photo.peopleDescriptions}
                </p>
              </div>
            )}
            {photo.sceneDescription && (
              <div>
                <span className="text-[10px] font-mono uppercase tracking-widest text-[#00ff4144]">
                  {"// SCENE"}
                </span>
                <p className="mt-0.5 text-xs font-mono text-[#00ff4199] line-clamp-2">
                  {photo.sceneDescription}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
