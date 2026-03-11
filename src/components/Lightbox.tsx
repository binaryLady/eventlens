// @TheTechMargin 2026
"use client";

import { PhotoRecord } from "@/lib/types";
import { useEffect, useRef, useState, useCallback } from "react";
import Image from "next/image";

interface LightboxProps {
  photo: PhotoRecord | null;
  photos: PhotoRecord[];
  onClose: () => void;
  onNavigate: (photo: PhotoRecord) => void;
}

function getDriveImageUrl(fileId: string) {
  return `https://lh3.googleusercontent.com/d/${fileId}=w1200`;
}

export default function Lightbox({
  photo,
  photos,
  onClose,
  onNavigate,
}: LightboxProps) {
  const [imageLoaded, setImageLoaded] = useState(false);
  const [showSpinner, setShowSpinner] = useState(false);
  const [touchStartX, setTouchStartX] = useState<number | null>(null);
  const [touchStartY, setTouchStartY] = useState<number | null>(null);
  const [isSwiping, setIsSwiping] = useState(false);
  const [showMeta, setShowMeta] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const imageElRef = useRef<HTMLDivElement>(null);
  const spinnerTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const currentIndex = photo
    ? photos.findIndex((p) => p.id === photo.id)
    : -1;
  const hasPrev = currentIndex > 0;
  const hasNext = currentIndex < photos.length - 1;

  // Stable refs for navigation callbacks so keyboard listener doesn't need re-attaching
  const goPrevRef = useRef(() => {});
  const goNextRef = useRef(() => {});
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

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

  goPrevRef.current = goPrev;
  goNextRef.current = goNext;

  const prevPhotoRef = useRef<PhotoRecord | null>(null);

  // Delayed spinner: only show loading indicator if image takes >150ms
  useEffect(() => {
    if (!photo) return;

    if (spinnerTimerRef.current) {
      clearTimeout(spinnerTimerRef.current);
      spinnerTimerRef.current = null;
    }

    setImageLoaded(false);
    setShowSpinner(false);

    spinnerTimerRef.current = setTimeout(() => {
      setShowSpinner(true);
    }, 150);

    if (prevPhotoRef.current === null) {
      setShowMeta(false);
    }
    prevPhotoRef.current = photo;

    return () => {
      if (spinnerTimerRef.current) {
        clearTimeout(spinnerTimerRef.current);
        spinnerTimerRef.current = null;
      }
    };
  }, [photo]);

  // Mark loaded — also clears pending spinner timer
  const handleImageLoaded = useCallback(() => {
    if (spinnerTimerRef.current) {
      clearTimeout(spinnerTimerRef.current);
      spinnerTimerRef.current = null;
    }
    setShowSpinner(false);
    setImageLoaded(true);
  }, []);

  // Stable keyboard listener — attach once when lightbox opens, never re-attach on navigation
  useEffect(() => {
    if (!photo) return;

    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCloseRef.current();
      if (e.key === "ArrowLeft") goPrevRef.current();
      if (e.key === "ArrowRight") goNextRef.current();
    };

    document.addEventListener("keydown", handleKey);
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", handleKey);
      document.body.style.overflow = "";
    };
  // Only depend on whether photo is truthy (lightbox open/closed), not the photo value
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [!!photo]);

  useEffect(() => {
    if (photo && closeRef.current) {
      closeRef.current.focus();
    }
  }, [photo]);

  // Preload adjacent images
  useEffect(() => {
    if (currentIndex < 0 || photos.length <= 1) return;

    const toPreload: string[] = [];
    const nextIdx = currentIndex < photos.length - 1 ? currentIndex + 1 : 0;
    const prevIdx = currentIndex > 0 ? currentIndex - 1 : photos.length - 1;

    const nextPhoto = photos[nextIdx];
    const prevPhoto = photos[prevIdx];

    if (nextPhoto?.driveFileId) toPreload.push(getDriveImageUrl(nextPhoto.driveFileId));
    if (prevPhoto?.driveFileId && prevIdx !== nextIdx) toPreload.push(getDriveImageUrl(prevPhoto.driveFileId));

    toPreload.forEach((url) => {
      const img = new window.Image();
      img.src = url;
    });
  }, [currentIndex, photos]);

  // Swipe handlers — use ref for offset to avoid per-frame re-renders
  const handleTouchStart = (e: React.TouchEvent) => {
    setTouchStartX(e.touches[0].clientX);
    setTouchStartY(e.touches[0].clientY);
    setIsSwiping(false);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (touchStartX === null || touchStartY === null) return;
    const dx = e.touches[0].clientX - touchStartX;
    const dy = e.touches[0].clientY - touchStartY;
    if (Math.abs(dx) > Math.abs(dy)) {
      if (!isSwiping) setIsSwiping(true);
      // Direct DOM update — avoids React re-render per touch frame
      if (imageElRef.current) {
        const el = imageElRef.current.querySelector('.lightbox-image') as HTMLElement | null;
        if (el) {
          el.style.transform = `translateX(${dx * 0.3}px)`;
          el.style.transition = 'none';
        }
      }
    }
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX === null) return;
    const dx = e.changedTouches[0].clientX - touchStartX;
    const dy = e.changedTouches[0].clientY - (touchStartY ?? 0);

    // Reset DOM styles
    if (imageElRef.current) {
      const el = imageElRef.current.querySelector('.lightbox-image') as HTMLElement | null;
      if (el) {
        el.style.transform = '';
        el.style.transition = '';
      }
    }

    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) {
      if (dx > 0) goPrev();
      else goNext();
    }
    else if (dy > 100 && Math.abs(dy) > Math.abs(dx)) {
      onClose();
    }

    setTouchStartX(null);
    setTouchStartY(null);
    setIsSwiping(false);
  };

  if (!photo) {
    prevPhotoRef.current = null;
    return null;
  }

  const isVideo =
    /\.(mp4|mov|webm|avi)$/i.test(photo.filename) ||
    photo.mimeType?.startsWith("video/");

  const fullImageUrl = photo.driveFileId
    ? getDriveImageUrl(photo.driveFileId)
    : "";

  const videoUrl = photo.driveFileId
    ? `/api/video?id=${photo.driveFileId}`
    : "";

  const hasMeta = !!(photo.visibleText || photo.peopleDescriptions || photo.sceneDescription || photo.faceCount > 0);

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-[rgba(26,26,26,0.95)] backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-label="Photo viewer"
      ref={dialogRef}
    >
      <div className="absolute inset-0 pointer-events-none z-[51] opacity-30">
        <div className="w-full h-full scan-line-bg" />
      </div>

      <div className="relative z-[52] flex items-center justify-between px-3 pt-safe-area-max md:px-4">
        {photos.length > 1 && (
          <span className="text-[10px] font-mono uppercase tracking-widest text-[var(--el-green-77)]">
            {currentIndex + 1} / {photos.length}
          </span>
        )}
        {photos.length <= 1 && <span />}

        <button
          ref={closeRef}
          onClick={onClose}
          className="flex h-10 w-10 items-center justify-center border border-[var(--el-flame-99)] bg-[var(--el-bg)] text-[var(--el-flame-99)] hover:border-[var(--el-magenta)] hover:text-[var(--el-magenta)] active:bg-[var(--el-green-99)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--el-green)] transition-all"
          aria-label="Close lightbox"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      <div
        className="relative flex-1 flex items-center justify-center min-h-0 px-2 md:px-16"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {photos.length > 1 && (
          <button
            onClick={goPrev}
            className="hidden md:flex absolute left-2 top-1/2 z-[52] -translate-y-1/2 h-12 w-12 items-center justify-center border border-[var(--el-green-99)] bg-[var(--el-bg)] text-[var(--el-green-99)] hover:border-[var(--el-magenta)] hover:text-[var(--el-magenta)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--el-green)] transition-all md:left-4"
            aria-label="Previous photo"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>
        )}

        {photos.length > 1 && (
          <button
            onClick={goNext}
            className="hidden md:flex absolute right-2 top-1/2 z-[52] -translate-y-1/2 h-12 w-12 items-center justify-center border border-[var(--el-green-99)] bg-[var(--el-bg)] text-[var(--el-green-99)] hover:border-[var(--el-magenta)] hover:text-[var(--el-magenta)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--el-green)] transition-all md:right-4"
            aria-label="Next photo"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </button>
        )}

        <div ref={imageElRef} className="relative flex items-center justify-center w-full h-full">
          {showSpinner && !imageLoaded && (
            <div className="absolute inset-0 flex items-center justify-center z-10">
              <div className="flex flex-col items-center gap-2">
                <div className="relative w-8 h-8">
                  <div className="absolute inset-0 border border-[var(--el-green)] animate-crosshair-spin" />
                  <div className="absolute inset-2 bg-[var(--el-green)] animate-pulse" />
                </div>
                <span className="text-[10px] font-mono uppercase tracking-widest text-[var(--el-green-77)]">
                  LOADING
                </span>
              </div>
            </div>
          )}
          {isVideo && videoUrl ? (
            <video
              key={photo.driveFileId}
              src={videoUrl}
              controls
              autoPlay
              playsInline
              className={`max-w-full max-h-full object-contain select-none lightbox-media ${imageLoaded ? 'loaded' : ''}`}
              onLoadedData={handleImageLoaded}
              onError={handleImageLoaded}
            />
          ) : fullImageUrl ? (
            <Image
              key={photo.driveFileId}
              src={fullImageUrl}
              alt={photo.filename}
              fill
              unoptimized
              className={`object-contain select-none lightbox-media lightbox-image ${imageLoaded ? 'loaded' : ''}`}
              draggable={false}
              onLoad={handleImageLoaded}
              onError={handleImageLoaded}
            />
          ) : null}
        </div>
      </div>

      <div className="relative z-[52] border-t border-[var(--el-green-22)] bg-[var(--el-bg)] pb-safe-area-max">
        <div className="flex justify-center pt-1.5 pb-0.5 md:hidden">
          <div className="w-8 h-0.5 rounded-full bg-[var(--el-green-33)]" />
        </div>

        <div className="px-3 py-2 md:px-6 md:py-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <h3 className="font-mono text-xs font-bold text-[var(--el-green)] uppercase tracking-wider truncate">
                {photo.filename}
              </h3>
              <span className="hidden sm:inline-block shrink-0 border border-[var(--el-green-33)] px-1.5 py-0.5 text-[9px] font-mono uppercase tracking-wider text-[var(--el-green-99)]">
                {photo.folder}
              </span>
              {photo.faceCount > 0 && (
                <span className="hidden sm:inline-block shrink-0 border border-[var(--el-green-22)] px-1.5 py-0.5 text-[9px] font-mono text-[var(--el-green-66)]">
                  {photo.faceCount} {photo.faceCount === 1 ? "FACE" : "FACES"}
                </span>
              )}
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {hasMeta && (
                <button
                  onClick={() => setShowMeta(!showMeta)}
                  className="md:hidden flex h-9 w-9 items-center justify-center border border-[var(--el-green-99)] bg-[var(--el-bg)] text-[var(--el-green-99)] active:bg-[var(--el-green-99)] transition-all"
                  aria-label="Toggle details"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10" />
                    <line x1="12" y1="16" x2="12" y2="12" />
                    <line x1="12" y1="8" x2="12.01" y2="8" />
                  </svg>
                </button>
              )}

              <a
                href={photo.downloadUrl}
                className="inline-flex h-9 items-center gap-2 border border-[var(--el-green-99)] bg-[var(--el-green-11)] px-3 text-xs font-mono uppercase tracking-wider text-[var(--el-green-99)] active:bg-[var(--el-green-22)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--el-green)] transition-all"
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

          <div className="flex items-center gap-2 mt-1.5 sm:hidden">
            <span className="border border-[var(--el-green-33)] px-1.5 py-0.5 text-[9px] font-mono uppercase tracking-wider text-[var(--el-green-99)]">
              {photo.folder}
            </span>
            {photo.faceCount > 0 && (
              <span className="border border-[var(--el-green-22)] px-1.5 py-0.5 text-[9px] font-mono text-[var(--el-green-66)]">
                {photo.faceCount} {photo.faceCount === 1 ? "FACE" : "FACES"}
              </span>
            )}
          </div>

          <div className={`overflow-hidden transition-all duration-200 ${showMeta ? "max-h-60 opacity-100 mt-3" : "md:max-h-60 md:opacity-100 md:mt-3 max-h-0 opacity-0"}`}>
            {photo.visibleText && (
              <div className="mb-2">
                <span className="text-[10px] font-mono uppercase tracking-widest text-[var(--el-green-66)]">
                  {"// TEXT DETECTED"}
                </span>
                <p className="mt-0.5 border-l-2 border-[var(--el-green-33)] pl-3 font-mono text-xs text-[var(--el-green-99)] line-clamp-2">
                  {photo.visibleText}
                </p>
              </div>
            )}
            {photo.peopleDescriptions && (
              <div className="mb-2">
                <span className="text-[10px] font-mono uppercase tracking-widest text-[var(--el-green-66)]">
                  {"// SUBJECTS"}
                </span>
                <p className="mt-0.5 text-xs font-mono text-[var(--el-green-99)] line-clamp-2">
                  {photo.peopleDescriptions}
                </p>
              </div>
            )}
            {photo.sceneDescription && (
              <div>
                <span className="text-[10px] font-mono uppercase tracking-widest text-[var(--el-green-66)]">
                  {"// SCENE"}
                </span>
                <p className="mt-0.5 text-xs font-mono text-[var(--el-green-99)] line-clamp-2">
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
