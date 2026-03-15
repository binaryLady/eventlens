// @TheTechMargin 2026
"use client";

import { useEffect, useState } from "react";
import { MatchActivity } from "@/lib/types";

interface Props {
  activity: MatchActivity[];
}

function formatEntry(entry: MatchActivity): string {
  const tier = entry.tier.toUpperCase();
  const matches = entry.match_count;
  const conf = entry.top_confidence ?? 0;
  return `${tier} SCAN // ${matches} MATCH${matches !== 1 ? "ES" : ""} // ${conf}% CONFIDENCE`;
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "JUST NOW";
  if (mins < 60) return `${mins}m AGO`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h AGO`;
  return `${Math.floor(hrs / 24)}d AGO`;
}

export default function ActivityTicker({ activity }: Props) {
  const [index, setIndex] = useState(0);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    if (activity.length <= 1) return;
    const interval = setInterval(() => {
      setVisible(false);
      setTimeout(() => {
        setIndex((prev) => (prev + 1) % activity.length);
        setVisible(true);
      }, 300);
    }, 4000);
    return () => clearInterval(interval);
  }, [activity.length]);

  const entry = activity[index];

  return (
    <div className="w-full py-1.5 px-4 flex items-center gap-2 text-xs font-mono overflow-hidden border-b border-zinc-800/50">
      <span
        className="inline-block w-1.5 h-1.5 rounded-full flex-shrink-0"
        style={{
          backgroundColor: activity.length > 0 ? "var(--el-cyan)" : "var(--el-primary)",
          animation: activity.length > 0 ? "pulse 2s infinite" : "none",
        }}
      />
      <span
        className="truncate transition-opacity duration-300"
        style={{
          color: "var(--el-cyan)",
          opacity: visible ? 1 : 0,
        }}
      >
        {entry
          ? `${formatEntry(entry)} // ${timeAgo(entry.created_at)}`
          : "SYSTEM IDLE // AWAITING SCAN INPUT"}
      </span>
    </div>
  );
}
