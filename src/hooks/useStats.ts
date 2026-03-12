// @TheTechMargin 2026
"use client";

import { useEffect, useState } from "react";
import { MatchActivity, HotPhoto, StatsResponse } from "@/lib/types";

export interface UseStatsReturn {
  recentActivity: MatchActivity[];
  hotPhotoIds: Set<string>;
  operativesCount: number;
}

export function useStats(): UseStatsReturn {
  const [recentActivity, setRecentActivity] = useState<MatchActivity[]>([]);
  const [hotPhotoIds, setHotPhotoIds] = useState<Set<string>>(new Set());
  const [operativesCount, setOperativesCount] = useState(0);

  useEffect(() => {
    const fetchStats = () => {
      fetch("/api/stats")
        .then((res) => res.json())
        .then((data: StatsResponse) => {
          setRecentActivity(data.recentActivity || []);
          setHotPhotoIds(new Set((data.hotPhotoIds || []).map((h: HotPhoto) => h.photo_id)));
          setOperativesCount(data.operativesCount || 0);
        })
        .catch(() => {});
    };
    fetchStats();
    const interval = setInterval(fetchStats, 30000);
    return () => clearInterval(interval);
  }, []);

  return { recentActivity, hotPhotoIds, operativesCount };
}
