// @TheTechMargin 2026
"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { PhotoRecord, PhotosResponse } from "@/lib/types";
import { shuffleArray } from "@/lib/utils";

export interface UsePhotosReturn {
  allPhotos: PhotoRecord[];
  shuffledPhotos: PhotoRecord[];
  folders: string[];
  tags: string[];
  lastUpdated: string;
  loading: boolean;
  error: boolean;
  toast: { message: string; count: number } | null;
  setToast: (t: { message: string; count: number } | null) => void;
  refresh: () => void;
  retryLoad: () => void;
}

export function usePhotos(): UsePhotosReturn {
  const [allPhotos, setAllPhotos] = useState<PhotoRecord[]>([]);
  const [shuffledPhotos, setShuffledPhotos] = useState<PhotoRecord[]>([]);
  const [folders, setFolders] = useState<string[]>([]);
  const [tags, setTags] = useState<string[]>([]);
  const [lastUpdated, setLastUpdated] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [toast, setToast] = useState<{ message: string; count: number } | null>(null);
  const pendingPhotosRef = useRef<PhotoRecord[] | null>(null);

  const fetchData = useCallback(async (): Promise<PhotosResponse | null> => {
    try {
      const res = await fetch("/api/photos");
      if (!res.ok) throw new Error("Failed to fetch");
      return await res.json();
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
        setTags(data.tags || []);
        setShuffledPhotos(shuffleArray(data.photos));
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
        setTags(data.tags || []);
        setLastUpdated(data.lastUpdated);
      } else if (data) {
        setFolders(data.folders);
        setTags(data.tags || []);
        setLastUpdated(data.lastUpdated);
      }
    }, 30000);
    return () => clearInterval(interval);
  }, [allPhotos.length, fetchData]);

  const refresh = useCallback(() => {
    if (pendingPhotosRef.current) {
      setAllPhotos(pendingPhotosRef.current);
      setShuffledPhotos(shuffleArray(pendingPhotosRef.current));
      pendingPhotosRef.current = null;
    }
    setToast(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  const retryLoad = useCallback(() => {
    setError(false);
    setLoading(true);
    fetchData().then((data) => {
      if (data) {
        setAllPhotos(data.photos);
        setShuffledPhotos(shuffleArray(data.photos));
        setFolders(data.folders);
        setTags(data.tags || []);
        setLastUpdated(data.lastUpdated);
        setLoading(false);
      } else {
        setError(true);
        setLoading(false);
      }
    });
  }, [fetchData]);

  return {
    allPhotos,
    shuffledPhotos,
    folders,
    tags,
    lastUpdated,
    loading,
    error,
    toast,
    setToast,
    refresh,
    retryLoad,
  };
}
