// @TheTechMargin 2026
"use client";

import { useState, useRef, useEffect } from "react";

const DEFAULT_BATCH_SIZE = 40;

export interface UseProgressiveRenderReturn {
  visibleCount: number;
  sentinelRef: React.RefObject<HTMLDivElement | null>;
}

export function useProgressiveRender(
  totalCount: number,
  batchSize: number = DEFAULT_BATCH_SIZE,
  resetKey: string = "",
): UseProgressiveRenderReturn {
  const [visibleCount, setVisibleCount] = useState(batchSize);
  const sentinelRef = useRef<HTMLDivElement>(null);

  // IntersectionObserver to load more
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisibleCount((prev) => Math.min(prev + batchSize, totalCount));
        }
      },
      { rootMargin: "400px" },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [totalCount, batchSize]);

  // Reset visible count when filters change
  useEffect(() => {
    setVisibleCount(batchSize);
  }, [resetKey, batchSize]);

  return { visibleCount, sentinelRef };
}
