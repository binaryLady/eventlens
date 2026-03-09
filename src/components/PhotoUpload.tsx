"use client";

import { useState, useRef } from "react";

interface PhotoUploadProps {
  onMatchResults: (results: {
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
  onClear: () => void;
  isActive: boolean;
}

export default function PhotoUpload({
  onMatchResults,
  onClear,
  isActive,
}: PhotoUploadProps) {
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const processFile = async (file: File) => {
    if (!file.type.startsWith("image/")) {
      setError("Please upload an image file.");
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      setError("Image must be under 10MB.");
      return;
    }

    setError(null);
    setUploading(true);

    // Show preview
    const reader = new FileReader();
    reader.onload = async (e) => {
      const dataUrl = e.target?.result as string;
      setPreview(dataUrl);

      // Extract base64 data (remove the data:image/...;base64, prefix)
      const base64 = dataUrl.split(",")[1];
      const mimeType = file.type;

      try {
        const res = await fetch("/api/match", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ image: base64, mimeType }),
        });

        const data = await res.json();

        if (!res.ok) {
          setError(data.error || "Failed to find matches.");
          setUploading(false);
          return;
        }

        if (data.error) {
          setError(data.error);
          setUploading(false);
          return;
        }

        onMatchResults(data);
      } catch {
        setError("Network error. Please try again.");
      }

      setUploading(false);
    };

    reader.readAsDataURL(file);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
    // Reset input so the same file can be re-selected
    e.target.value = "";
  };

  const handleClear = () => {
    setPreview(null);
    setError(null);
    setUploading(false);
    onClear();
  };

  return (
    <div className="mt-4">
      {/* Upload buttons row */}
      {!isActive && !uploading && (
        <div className="flex items-center justify-center gap-3">
          <button
            onClick={() => fileInputRef.current?.click()}
            className="inline-flex items-center gap-2 rounded-xl border border-zinc-700 bg-zinc-800/50 px-4 py-2.5 text-sm font-medium text-zinc-300 transition-colors hover:border-[var(--color-primary)] hover:text-zinc-100"
          >
            {/* Camera/photo icon */}
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
              <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
              <circle cx="12" cy="13" r="4" />
            </svg>
            Find me in photos
          </button>

          {/* Camera capture (mobile) */}
          <button
            onClick={() => cameraInputRef.current?.click()}
            className="inline-flex items-center gap-2 rounded-xl border border-zinc-700 bg-zinc-800/50 px-4 py-2.5 text-sm font-medium text-zinc-300 transition-colors hover:border-[var(--color-primary)] hover:text-zinc-100 md:hidden"
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
              <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
              <line x1="8" y1="21" x2="16" y2="21" />
              <line x1="12" y1="17" x2="12" y2="21" />
            </svg>
            Take selfie
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
            <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-full border-2 border-[var(--color-primary)]">
              <img
                src={preview}
                alt="Your photo"
                className="h-full w-full object-cover"
              />
            </div>
          )}

          {uploading ? (
            <div className="flex items-center gap-2 text-sm text-zinc-400">
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-zinc-600 border-t-[var(--color-primary)]" />
              Matching faces...
            </div>
          ) : (
            <button
              onClick={handleClear}
              className="inline-flex items-center gap-1.5 rounded-full bg-zinc-800 px-3 py-1.5 text-xs font-medium text-zinc-400 transition-colors hover:bg-zinc-700 hover:text-zinc-200"
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
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
              Clear face search
            </button>
          )}
        </div>
      )}

      {/* Error message */}
      {error && (
        <p className="mt-2 text-center text-sm text-red-400">{error}</p>
      )}
    </div>
  );
}
