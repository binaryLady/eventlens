// @TheTechMargin 2026
"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { PhotoRecord, MatchResult, MatchTier } from "@/lib/types";

export interface UseSearchReturn {
  searchInput: string;
  setSearchInput: (v: string) => void;
  debouncedQuery: string;
  serverResults: PhotoRecord[] | null;
  matchResults: MatchResult[] | null;
  matchDescription: string;
  recommendations: string[];
  handleMatchResults: (data: {
    matches: MatchResult[];
    description: string;
    tier?: MatchTier;
    recommendations?: string[];
  }) => void;
  handleClearMatch: () => void;
}

export function useSearch(
  initialQuery: string,
  activeFolder: string,
): UseSearchReturn {
  const [searchInput, setSearchInput] = useState(initialQuery);
  const [debouncedQuery, setDebouncedQuery] = useState(initialQuery);
  const [serverResults, setServerResults] = useState<PhotoRecord[] | null>(null);
  const [matchResults, setMatchResults] = useState<MatchResult[] | null>(null);
  const [matchDescription, setMatchDescription] = useState("");
  const [recommendations, setRecommendations] = useState<string[]>([]);
  const debounceRef = useRef<NodeJS.Timeout>(undefined);

  // Debounced search
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setDebouncedQuery(searchInput);
    }, 250);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [searchInput]);

  // Server-side semantic search
  useEffect(() => {
    if (!debouncedQuery || matchResults !== null) {
      setServerResults(null);
      return;
    }

    let cancelled = false;
    const params = new URLSearchParams({ q: debouncedQuery });
    if (activeFolder) params.set("folder", activeFolder);

    fetch(`/api/search?${params}`)
      .then((res) => res.json())
      .then((data: { results: PhotoRecord[]; source: string }) => {
        if (cancelled) return;
        if (data.results.length > 0) {
          setServerResults(data.results);
        } else {
          setServerResults(null);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setServerResults(null);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [debouncedQuery, activeFolder, matchResults]);

  const handleMatchResults = useCallback(
    (data: {
      matches: MatchResult[];
      description: string;
      tier?: MatchTier;
      recommendations?: string[];
    }) => {
      setMatchResults(data.matches);
      setMatchDescription(data.description);
      setRecommendations(data.recommendations || []);
    },
    [],
  );

  const handleClearMatch = useCallback(() => {
    setMatchResults(null);
    setMatchDescription("");
    setRecommendations([]);
  }, []);

  return {
    searchInput,
    setSearchInput,
    debouncedQuery,
    serverResults,
    matchResults,
    matchDescription,
    recommendations,
    handleMatchResults,
    handleClearMatch,
  };
}
