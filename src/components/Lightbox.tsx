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
  const [touchStart, setTouchStart] = useState<number | null>(null);
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
    setTouchStart(e.touches[0].clientX);
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStart === null) return;
    const diff = e.changedTouches[0].clientX - touchStart;
    if (Math.abs(diff) > 60) {
      if (diff > 0) goPrev();
      else goNext();
    }
    setTouchStart(null);
  };

  if (!photo) return null;

  const fullImageUrl = photo.driveFileId
    ? `https://lh3.googleusercontent.com/d/${photo.driveFileId}=w1600`
    : "";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/95 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-label="Photo viewer"
      ref={dialogRef}
    >
      {/* Scan line overlay on lightbox */}
      <div className="absolute inset-0 pointer-events-none z-[51] opacity-30">
        <div className="w-full h-full" style={{
          backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,255,65,0.02) 2px, rgba(0,255,65,0.02) 4px)',
        }} />
      </div>

      {/* Close button */}
      <button
        ref={closeRef}
        onClick={onClose}
        className="absolute top-4 right-4 z-[52] flex h-8 w-8 items-center justify-center border border-[#00ff4133] bg-black text-[#00ff4199] hover:border-[#00ff41] hover:text-[#00ff41] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#00ff41] transition-all"
        aria-label="Close lightbox"
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

      {/* Prev button */}
      {photos.length > 1 && (
        <button
          onClick={goPrev}
          className="absolute left-2 top-1/2 z-[52] -translate-y-1/2 flex h-10 w-10 items-center justify-center border border-[#00ff4133] bg-black text-[#00ff4199] hover:border-[#00ff41] hover:text-[#00ff41] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#00ff41] transition-all md:left-4"
          aria-label="Previous photo"
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
      )}

      {/* Next button */}
      {photos.length > 1 && (
        <button
          onClick={goNext}
          className="absolute right-2 top-1/2 z-[52] -translate-y-1/2 flex h-10 w-10 items-center justify-center border border-[#00ff4133] bg-black text-[#00ff4199] hover:border-[#00ff41] hover:text-[#00ff41] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#00ff41] transition-all md:right-4"
          aria-label="Next photo"
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </button>
      )}

      {/* Counter */}
      {photos.length > 1 && (
        <div className="absolute top-4 left-4 z-[52] text-[10px] font-mono uppercase tracking-widest text-[#00ff4155]">
          {currentIndex + 1} / {photos.length}
        </div>
      )}

      {/* Content */}
      <div
        className="flex max-h-full w-full max-w-5xl flex-col overflow-y-auto px-4 py-16 md:px-8"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        {/* Image */}
        <div className="relative flex items-center justify-center">
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
              className="max-h-[70vh] w-auto max-w-full object-contain"
              style={{
                boxShadow: imageLoaded ? '0 0 30px rgba(0,255,65,0.1)' : 'none',
              }}
              onLoad={() => setImageLoaded(true)}
              onError={() => setImageLoaded(true)}
            />
          )}
        </div>

        {/* Metadata panel */}
        <div className="mt-4 border border-[#00ff4122] bg-black p-4 md:p-6 relative">
          {/* Corner brackets */}
          <div className="absolute top-0 left-0 w-3 h-3 border-t border-l border-[#00ff4144] -translate-x-px -translate-y-px" />
          <div className="absolute bottom-0 right-0 w-3 h-3 border-b border-r border-[#00ff4144] translate-x-px translate-y-px" />

          <div className="flex flex-wrap items-center gap-3">
            <h3 className="font-mono text-sm font-bold text-[#00ff41] uppercase tracking-wider">
              {photo.filename}
            </h3>
            <span className="border border-[#00ff4133] px-2 py-0.5 text-[10px] font-mono uppercase tracking-wider text-[#00ff4199]">
              {photo.folder}
            </span>
            {photo.faceCount > 0 && (
              <span className="border border-[#00ff4122] px-2 py-0.5 text-[10px] font-mono text-[#00ff4166]">
                {photo.faceCount} {photo.faceCount === 1 ? "FACE" : "FACES"}
              </span>
            )}
          </div>

          {photo.visibleText && (
            <div className="mt-3">
              <span className="text-[10px] font-mono uppercase tracking-widest text-[#00ff4144]">
                {"// TEXT DETECTED"}
              </span>
              <p className="mt-1 border-l-2 border-[#00ff4133] pl-3 font-mono text-xs text-[#00ff4199]">
                {photo.visibleText}
              </p>
            </div>
          )}

          {photo.peopleDescriptions && (
            <div className="mt-3">
              <span className="text-[10px] font-mono uppercase tracking-widest text-[#00ff4144]">
                {"// SUBJECTS"}
              </span>
              <p className="mt-1 text-xs font-mono text-[#00ff4199]">
                {photo.peopleDescriptions}
              </p>
            </div>
          )}

          {photo.sceneDescription && (
            <div className="mt-3">
              <span className="text-[10px] font-mono uppercase tracking-widest text-[#00ff4144]">
                {"// SCENE"}
              </span>
              <p className="mt-1 text-xs font-mono text-[#00ff4199]">
                {photo.sceneDescription}
              </p>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-2 pt-4 mt-4 border-t border-[#00ff4115]">
            <a
              href={photo.driveUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 border border-[#00ff41] bg-[#00ff4111] px-4 py-2 text-xs font-mono uppercase tracking-wider text-[#00ff41] hover:bg-[#00ff4122] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#00ff41] transition-all"
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                <polyline points="15 3 21 3 21 9" />
                <line x1="10" y1="14" x2="21" y2="3" />
              </svg>
              OPEN IN DRIVE
            </a>
            <a
              href={photo.downloadUrl}
              className="inline-flex items-center gap-2 border border-[#00ff4133] px-4 py-2 text-xs font-mono uppercase tracking-wider text-[#00ff4199] hover:border-[#00ff41] hover:text-[#00ff41] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#00ff41] transition-all"
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
              DOWNLOAD
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
