// @TheTechMargin 2026
"use client";

import { MatchResult } from "@/lib/types";

interface SearchStatusProps {
  debouncedQuery: string;
  matchResults: MatchResult[] | null;
  matchDescription: string;
  filteredCount: number;
  totalCount: number;
}

export default function SearchStatus({
  debouncedQuery,
  matchResults,
  matchDescription,
  filteredCount,
  totalCount,
}: SearchStatusProps) {
  return (
    <div className="mx-auto max-w-5xl px-3 md:px-4 pb-2 md:pb-3">
      <p className="text-[10px] font-mono uppercase tracking-widest text-[var(--el-green-99)]">
        {matchResults !== null ? (
          <>
            {debouncedQuery ? (
              <>{filteredCount} OF {matchResults.length} MATCH{matchResults.length !== 1 ? "ES" : ""} FOR &quot;{debouncedQuery.toUpperCase()}&quot;</>
            ) : (
              <>{matchResults.length} MATCH{matchResults.length !== 1 ? "ES" : ""}</>
            )}
            {matchResults.length > 0 && (() => {
              const tiers = new Set(matchResults.map((m) => m.tier));
              const parts: string[] = [];
              if (tiers.has("text")) parts.push("TEXT");
              if (tiers.has("visual")) parts.push("VISUAL");
              if (tiers.has("vector")) parts.push("VECTOR");
              if (tiers.has("both")) { parts.length = 0; parts.push("TEXT", "VISUAL"); }
              return (
                <span className="text-[var(--el-green)]">
                  {" // "}{parts.join(" + ")} SCAN
                </span>
              );
            })()}
            {matchDescription && (
              <span className="text-[var(--el-green-d9)]">
                {" // "}
                {matchDescription}
              </span>
            )}
          </>
        ) : debouncedQuery ? (
          <>
            {filteredCount} RESULT{filteredCount !== 1 ? "S" : ""} FOR &quot;{debouncedQuery.toUpperCase()}&quot;
          </>
        ) : (
          <>
            {filteredCount} / {totalCount} ASSETS
          </>
        )}
      </p>
    </div>
  );
}
