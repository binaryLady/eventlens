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

  // Focus trap
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
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-label="Photo viewer"
      ref={dialogRef}
    >
      {/* Close button */}
      <button
        ref={closeRef}
        onClick={onClose}
        className="absolute top-4 right-4 z-50 flex h-10 w-10 items-center justify-center rounded-full bg-zinc-800/80 text-zinc-300 hover:bg-zinc-700 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)] transition-colors"
        aria-label="Close lightbox"
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
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>

      {/* Prev button */}
      {photos.length > 1 && (
        <button
          onClick={goPrev}
          className="absolute left-2 top-1/2 z-50 -translate-y-1/2 flex h-12 w-12 items-center justify-center rounded-full bg-zinc-800/80 text-zinc-300 hover:bg-zinc-700 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)] transition-colors md:left-4"
          aria-label="Previous photo"
        >
          <svg
            width="24"
            height="24"
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
          className="absolute right-2 top-1/2 z-50 -translate-y-1/2 flex h-12 w-12 items-center justify-center rounded-full bg-zinc-800/80 text-zinc-300 hover:bg-zinc-700 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)] transition-colors md:right-4"
          aria-label="Next photo"
        >
          <svg
            width="24"
            height="24"
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
              <div className="h-10 w-10 animate-spin rounded-full border-4 border-zinc-600 border-t-[var(--color-primary)]" />
            </div>
          )}
          {fullImageUrl && (
            <img
              src={fullImageUrl}
              alt={photo.filename}
              className="max-h-[70vh] w-auto max-w-full rounded-lg object-contain"
              onLoad={() => setImageLoaded(true)}
              onError={() => setImageLoaded(true)}
            />
          )}
        </div>

        {/* Metadata panel */}
        <div className="mt-4 space-y-3 rounded-xl bg-zinc-900 p-4 md:p-6">
          <div className="flex flex-wrap items-center gap-3">
            <h3 className="font-heading text-lg font-bold text-zinc-100">
              {photo.filename}
            </h3>
            <span className="rounded-full bg-[var(--color-primary)]/20 px-3 py-0.5 text-xs font-medium text-[var(--color-primary)]">
              {photo.folder}
            </span>
            {photo.faceCount > 0 && (
              <span className="rounded-full bg-zinc-800 px-2.5 py-0.5 text-xs text-zinc-400">
                {photo.faceCount} {photo.faceCount === 1 ? "face" : "faces"}
              </span>
            )}
          </div>

          {photo.visibleText && (
            <div>
              <span className="text-xs font-medium uppercase tracking-wider text-zinc-500">
                Text found
              </span>
              <p className="mt-1 rounded bg-zinc-800 px-3 py-2 font-mono text-sm text-zinc-300">
                {photo.visibleText}
              </p>
            </div>
          )}

          {photo.peopleDescriptions && (
            <div>
              <span className="text-xs font-medium uppercase tracking-wider text-zinc-500">
                People
              </span>
              <p className="mt-1 text-sm text-zinc-300">
                {photo.peopleDescriptions}
              </p>
            </div>
          )}

          {photo.sceneDescription && (
            <div>
              <span className="text-xs font-medium uppercase tracking-wider text-zinc-500">
                Scene
              </span>
              <p className="mt-1 text-sm text-zinc-300">
                {photo.sceneDescription}
              </p>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <a
              href={photo.driveUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-lg bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-white hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)] focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-900 transition-opacity"
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
                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                <polyline points="15 3 21 3 21 9" />
                <line x1="10" y1="14" x2="21" y2="3" />
              </svg>
              Open in Drive
            </a>
            <a
              href={photo.downloadUrl}
              className="inline-flex items-center gap-2 rounded-lg bg-zinc-800 px-4 py-2 text-sm font-medium text-zinc-200 hover:bg-zinc-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)] focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-900 transition-colors"
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
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
              Download
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
