// @TheTechMargin 2026
// Duplicate detection — fetch clusters, hide/unhide photos.

import { useState, useCallback } from "react";
import type { DuplicateData } from "@/app/admin/types";

interface UseAdminDuplicatesOptions {
  headers: () => Record<string, string>;
  addLog: (msg: string) => void;
}

export function useAdminDuplicates({ headers, addLog }: UseAdminDuplicatesOptions) {
  const [duplicates, setDuplicates] = useState<DuplicateData | null>(null);
  const [dupsLoading, setDupsLoading] = useState(false);

  const fetchDuplicates = useCallback(
    async (threshold = 10) => {
      setDupsLoading(true);
      try {
        const res = await fetch(`/api/admin/duplicates?threshold=${threshold}`, {
          headers: headers(),
        });
        if (res.ok) {
          const data: DuplicateData = await res.json();
          setDuplicates(data);
          addLog(`Found ${data.totalClusters} duplicate clusters (${data.totalDuplicates} photos)`);
        } else {
          const err = await res.json();
          addLog(`Duplicates error: ${err.error || res.statusText}`);
        }
      } catch (error) {
        addLog(`Duplicates error: ${error instanceof Error ? error.message : "Network error"}`);
      }
      setDupsLoading(false);
    },
    [headers, addLog],
  );

  const updatePhotoVisibility = useCallback(
    (ids: string[], hidden: boolean) => {
      setDuplicates((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          clusters: prev.clusters.map((c) => ({
            ...c,
            photos: c.photos.map((p) => (ids.includes(p.id) ? { ...p, hidden } : p)),
          })),
        };
      });
    },
    [],
  );

  const hidePhotos = useCallback(
    async (ids: string[]) => {
      try {
        const res = await fetch("/api/admin/photos/hide", {
          method: "POST",
          headers: headers(),
          body: JSON.stringify({ ids, hidden: true }),
        });
        if (res.ok) {
          addLog(`Hidden ${ids.length} photo(s)`);
          updatePhotoVisibility(ids, true);
        } else {
          const err = await res.json();
          addLog(`Hide error: ${err.error || res.statusText}`);
        }
      } catch (error) {
        addLog(`Hide error: ${error instanceof Error ? error.message : "Network error"}`);
      }
    },
    [headers, addLog, updatePhotoVisibility],
  );

  const unhidePhotos = useCallback(
    async (ids: string[]) => {
      try {
        const res = await fetch("/api/admin/photos/hide", {
          method: "POST",
          headers: headers(),
          body: JSON.stringify({ ids, hidden: false }),
        });
        if (res.ok) {
          addLog(`Unhidden ${ids.length} photo(s)`);
          updatePhotoVisibility(ids, false);
        }
      } catch (error) {
        addLog(`Unhide error: ${error instanceof Error ? error.message : "Network error"}`);
      }
    },
    [headers, addLog, updatePhotoVisibility],
  );

  return { duplicates, dupsLoading, fetchDuplicates, hidePhotos, unhidePhotos };
}
