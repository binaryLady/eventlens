// @TheTechMargin 2026
"use client";

import { useState, useRef, useCallback } from "react";
import Image from "next/image";
import { MatchResponse } from "@/lib/types";

interface PhotoUploadProps {
  onMatchResults: (results: MatchResponse) => void;
  onClear: () => void;
  isActive: boolean;
}

export default function PhotoUpload({
  onMatchResults,
  onClear,
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

        onMatchResults(data);
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
    onClear();
  };

  return (
    <div className="mt-4">
      {!isActive && !uploading && (
        <div className="flex items-center justify-center gap-2">
          <button
            onClick={() => fileInputRef.current?.click()}
            className="inline-flex items-center gap-2 border border-[var(--el-green-99)] bg-[rgba(26,26,26,0.6)] px-4 py-2 text-xs font-mono uppercase tracking-wider text-[var(--el-green-99)] transition-all hover:border-[var(--el-magenta)] hover:text-[var(--el-magenta)] hover:shadow-[0_0_10px_rgba(255,0,255,0.25)]"
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
              <circle cx="12" cy="12" r="10" />
              <circle cx="12" cy="12" r="3" />
              <line x1="12" y1="2" x2="12" y2="6" />
              <line x1="12" y1="18" x2="12" y2="22" />
              <line x1="2" y1="12" x2="6" y2="12" />
              <line x1="18" y1="12" x2="22" y2="12" />
            </svg>
            Upload Photo to Search for Matches
          </button>

          <button
            onClick={() => cameraInputRef.current?.click()}
            className="inline-flex items-center gap-2 border border-[var(--el-green-99)] bg-[rgba(26,26,26,0.6)] px-4 py-2 text-xs font-mono uppercase tracking-wider text-[var(--el-green-99)] transition-all hover:border-[var(--el-magenta)] hover:text-[var(--el-magenta)] hover:shadow-[0_0_10px_rgba(255,0,255,0.25)] md:hidden"
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

      {(uploading || isActive) && (
        <div className="flex items-center justify-center gap-3">
          {preview && (
            <div className="relative h-10 w-10 shrink-0 overflow-hidden border border-[var(--el-green)] animate-pulse-green">
              <Image
                src={preview}
                alt="Your photo"
                fill
                unoptimized
                className="object-cover"
              />
            </div>
          )}

          {uploading ? (
            <div className="flex items-center gap-2 text-xs font-mono uppercase tracking-wider text-[var(--el-flame-dd)]">
              <div className="relative w-4 h-4">
                <div className="absolute inset-0 border border-[var(--el-green)] animate-crosshair-spin" />
                <div className="absolute inset-1 bg-[var(--el-green)] animate-pulse" />
              </div>
              {statusText}
            </div>
          ) : (
            <button
              onClick={handleClear}
              className="inline-flex items-center gap-1.5 border border-[var(--el-green-99)] bg-[rgba(26,26,26,0.6)] px-3 py-1 text-[10px] font-mono uppercase tracking-wider text-[var(--el-green-99)] transition-all hover:border-[var(--el-magenta)] hover:text-[var(--el-magenta)]"
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

      {error && (
        <p className="mt-2 text-center text-[10px] font-mono uppercase tracking-wider text-red-500">
          &#9888; {error}
        </p>
      )}
    </div>
  );
}
