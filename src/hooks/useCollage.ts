// @TheTechMargin 2026
"use client";

import { useState, useCallback } from "react";
import { PhotoRecord } from "@/lib/types";
import type { CollageRatio } from "@/components/FloatingActionBar";

export interface UseCollageReturn {
  collagePending: boolean;
  collagePreviewUrl: string | null;
  showRatioModal: boolean;
  downloading: boolean;
  startCollage: () => void;
  handleRatioSelect: (ratio: CollageRatio) => void;
  handleCollageDownload: () => void;
  handleCollageDismiss: () => void;
  handleDownloadZip: () => Promise<void>;
}

export function useCollage(
  selectedIds: Set<string>,
  filteredPhotos: PhotoRecord[],
  clearSelection: () => void,
  setToast: (t: { message: string; count: number } | null) => void,
): UseCollageReturn {
  const [collagePending, setCollagePending] = useState(false);
  const [collagePreviewUrl, setCollagePreviewUrl] = useState<string | null>(null);
  const [showRatioModal, setShowRatioModal] = useState(false);
  const [downloading, setDownloading] = useState(false);

  const startCollage = useCallback(() => {
    if (selectedIds.size === 0) return;
    setShowRatioModal(true);
  }, [selectedIds]);

  const handleRatioSelect = useCallback(async (ratio: CollageRatio) => {
    setShowRatioModal(false);
    setCollagePending(true);
    try {
      const files = filteredPhotos
        .filter((p) => selectedIds.has(p.id))
        .map((p) => ({ fileId: p.driveFileId, filename: p.filename }));

      const res = await fetch("/api/collage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ files, hero: files.length > 4, ratio }),
      });

      if (!res.ok) throw new Error("Collage generation failed");

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      setCollagePreviewUrl(url);
    } catch {
      setToast({ message: "COLLAGE GENERATION FAILED — RETRY", count: 0 });
    } finally {
      setCollagePending(false);
    }
  }, [selectedIds, filteredPhotos, setToast]);

  const handleCollageDownload = useCallback(() => {
    if (!collagePreviewUrl) return;
    const a = document.createElement("a");
    a.href = collagePreviewUrl;
    a.download = "eventlens-collage.jpg";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(collagePreviewUrl);
    setCollagePreviewUrl(null);
    clearSelection();
  }, [collagePreviewUrl, clearSelection]);

  const handleCollageDismiss = useCallback(() => {
    if (collagePreviewUrl) {
      URL.revokeObjectURL(collagePreviewUrl);
    }
    setCollagePreviewUrl(null);
  }, [collagePreviewUrl]);

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

      clearSelection();
    } catch {
      setToast({ message: "ZIP DOWNLOAD FAILED — RETRY", count: 0 });
    } finally {
      setDownloading(false);
    }
  }, [selectedIds, filteredPhotos, clearSelection, setToast]);

  return {
    collagePending,
    collagePreviewUrl,
    showRatioModal,
    downloading,
    startCollage,
    handleRatioSelect,
    handleCollageDownload,
    handleCollageDismiss,
    handleDownloadZip,
  };
}
