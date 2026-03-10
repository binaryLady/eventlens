"use client";

import { useState, useRef, useCallback } from "react";

interface PhotoUploadProps {
  onMatchResultsAction: (results: {
    matches: Array<{
      photo: {
        id: string;
        filename: string;
        driveUrl: string;
        driveFileId: string;
        folder: string;
        visibleText: string;
        peopleDescriptions: string;
        sceneDescription: string;
        faceCount: number;
        processedAt: string;
        thumbnailUrl: string;
        downloadUrl: string;
      };
      confidence: number;
      reason: string;
    }>;
    description: string;
  }) => void;
  onClearAction: () => void;
  isActive: boolean;
}

export default function PhotoUpload({
  onMatchResultsAction,
  onClearAction,
  isActive,
}: PhotoUploadProps) {
  const [uploading, setUploading] = useState(false);
  const [statusText, setStatusText] = useState("SCANNING...");
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const deepScanTimerRef = useRef<NodeJS.Timeout>();

  const clearDeepScanTimer = useCallback(() => {
    if (deepScanTimerRef.current) {
      clearTimeout(deepScanTimerRef.current);
      deepScanTimerRef.current = undefined;
    }
  }, []);

  const processFile = async (file: File) => {
    if (!file.type.startsWith("image/")) {
      setError("INVALID FORMAT — IMAGE FILE REQUIRED");
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      setError("FILE TOO LARGE — 10MB MAX");
      return;
    }

    setError(null);
    setUploading(true);
    setStatusText("SCANNING...");

    // If response takes > 4s, visual fallback kicked in
    clearDeepScanTimer();
    deepScanTimerRef.current = setTimeout(() => {
      setStatusText("DEEP SCANNING...");
    }, 4000);

    const reader = new FileReader();
    reader.onload = async (e) => {
      const dataUrl = e.target?.result as string;
      setPreview(dataUrl);

      const base64 = dataUrl.split(",")[1];
      const mimeType = file.type;

      try {
        const res = await fetch("/api/match", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ image: base64, mimeType }),
        });

        clearDeepScanTimer();
        const data = await res.json();

        if (!res.ok) {
          setError(data.error || "MATCH FAILED — TRY AGAIN");
          setUploading(false);
          return;
        }

        if (data.error) {
          setError(data.error);
          setUploading(false);
          return;
        }

        onMatchResultsAction(data);
      } catch {
        clearDeepScanTimer();
        setError("NETWORK ERROR — RETRY");
      }

      setUploading(false);
    };

    reader.readAsDataURL(file);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
    e.target.value = "";
  };

  const handleClear = () => {
    clearDeepScanTimer();
    setPreview(null);
    setError(null);
    setUploading(false);
    onClearAction();
  };

  return (
    <div className="mt-4">
      {/* Upload buttons row */}
      {!isActive && !uploading && (
        <div className="flex items-center justify-center gap-2">
          <button
            onClick={() => fileInputRef.current?.click()}
            className="inline-flex items-center gap-2 border border-[#00ff4133] bg-black/60 px-4 py-2 text-xs font-mono uppercase tracking-wider text-[#00ff4199] transition-all hover:border-[#00ff41] hover:text-[#00ff41] hover:shadow-[0_0_10px_rgba(0,255,65,0.15)]"
          >
            {/* Crosshair/target icon */}
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
              <circle cx="12" cy="12" r="10" />
              <circle cx="12" cy="12" r="3" />
              <line x1="12" y1="2" x2="12" y2="6" />
              <line x1="12" y1="18" x2="12" y2="22" />
              <line x1="2" y1="12" x2="6" y2="12" />
              <line x1="18" y1="12" x2="22" y2="12" />
            </svg>
            FACIAL SCAN
          </button>

          {/* Camera capture (mobile) */}
          <button
            onClick={() => cameraInputRef.current?.click()}
            className="inline-flex items-center gap-2 border border-[#00ff4133] bg-black/60 px-4 py-2 text-xs font-mono uppercase tracking-wider text-[#00ff4199] transition-all hover:border-[#00ff41] hover:text-[#00ff41] hover:shadow-[0_0_10px_rgba(0,255,65,0.15)] md:hidden"
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
              <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
              <circle cx="12" cy="13" r="4" />
            </svg>
            CAPTURE
          </button>

          {/* Hidden file inputs */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleFileChange}
            className="hidden"
            aria-label="Upload photo"
          />
          <input
            ref={cameraInputRef}
            type="file"
            accept="image/*"
            capture="user"
            onChange={handleFileChange}
            className="hidden"
            aria-label="Take selfie"
          />
        </div>
      )}

      {/* Active state: preview + status */}
      {(uploading || isActive) && (
        <div className="flex items-center justify-center gap-3">
          {/* Photo preview thumbnail */}
          {preview && (
            <div className="relative h-10 w-10 shrink-0 overflow-hidden border border-[#00ff41] animate-pulse-green">
              <img
                src={preview}
                alt="Your photo"
                className="h-full w-full object-cover"
              />
            </div>
          )}

          {uploading ? (
            <div className="flex items-center gap-2 text-xs font-mono uppercase tracking-wider text-[#00ff4199]">
              {/* Scanning animation */}
              <div className="relative w-4 h-4">
                <div className="absolute inset-0 border border-[#00ff41] animate-crosshair-spin" />
                <div className="absolute inset-1 bg-[#00ff41] animate-pulse" />
              </div>
              {statusText}
            </div>
          ) : (
            <button
              onClick={handleClear}
              className="inline-flex items-center gap-1.5 border border-[#00ff4133] bg-black/60 px-3 py-1 text-[10px] font-mono uppercase tracking-wider text-[#00ff4166] transition-all hover:border-[#00ff41] hover:text-[#00ff41]"
            >
              <svg
                width="12"
                height="12"
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
              CLEAR SCAN
            </button>
          )}
        </div>
      )}

      {/* Error message */}
      {error && (
        <p className="mt-2 text-center text-[10px] font-mono uppercase tracking-wider text-red-500">
          &#9888; {error}
        </p>
      )}
    </div>
  );
}
