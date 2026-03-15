// @TheTechMargin 2026
// Pipeline status overview — 8 metric cards + progress bar.

import type { StatusData } from "../types";

interface StatusCardsProps {
  status: StatusData;
}

export function StatusCards({ status }: StatusCardsProps) {
  const pct = status.total > 0 ? Math.round((status.completed / status.total) * 100) : 0;

  return (
    <>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <Card label="TOTAL PHOTOS" value={status.total} />
        <Card label="COMPLETED" value={status.completed} color="var(--el-green)" />
        <Card label="PENDING" value={status.pending} color="var(--el-amber)" />
        <Card label="ERRORS" value={status.errors} color={status.errors > 0 ? "var(--el-red)" : undefined} />
        <Card label="TEXT EMBEDDINGS" value={status.withEmbeddings} color="var(--el-cyan)" />
        <Card label="FACE EMBEDDINGS" value={status.faceEmbeddings} color="var(--el-purple)" />
        <Card label="PROCESSING" value={status.processing} color="var(--el-blue)" />
        <Card label="PROGRESS" value={pct} suffix="%" color="var(--el-green)" />
      </div>

      {status.total > 0 && (
        <div className="mb-6">
          <div className="w-full h-2 bg-[var(--el-green-11)] border border-[var(--el-green-33)]">
            <div
              className="h-full bg-[var(--el-green)] transition-all duration-500"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      )}
    </>
  );
}

function Card({
  label,
  value,
  color,
  suffix,
}: {
  label: string;
  value: number;
  color?: string;
  suffix?: string;
}) {
  return (
    <div className="border border-[var(--el-green-33)] p-3 text-center">
      <div className="text-2xl font-bold mb-1" style={{ color: color || "var(--el-green-99)" }}>
        {value.toLocaleString()}{suffix || ""}
      </div>
      <div className="text-[10px] tracking-wider text-[var(--el-green-66)]">{label}</div>
    </div>
  );
}
