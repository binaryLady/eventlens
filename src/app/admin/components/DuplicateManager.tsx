// @TheTechMargin 2026
// Duplicate detection — scan for near-duplicates and manage visibility.

import { ActionButton } from "./ActionButton";
import type { DuplicateCluster, DuplicateData } from "../types";

interface DuplicateManagerProps {
  duplicates: DuplicateData | null;
  dupsLoading: boolean;
  onScan: () => void;
  onHide: (ids: string[]) => void;
  onUnhide: (ids: string[]) => void;
}

export function DuplicateManager({
  duplicates,
  dupsLoading,
  onScan,
  onHide,
  onUnhide,
}: DuplicateManagerProps) {
  return (
    <div className="mb-8">
      <h2 className="text-sm tracking-wider mb-3 text-[var(--el-flame)]">DUPLICATES</h2>
      <div className="flex items-center gap-3 mb-4">
        <ActionButton
          label="SCAN DUPLICATES"
          description="Find near-duplicate photo clusters"
          loading={dupsLoading}
          disabled={dupsLoading}
          onClick={onScan}
        />
        {duplicates && (
          <div className="text-xs text-[var(--el-flame-99)]">
            {duplicates.totalClusters} clusters / {duplicates.totalDuplicates} photos / threshold:{" "}
            {duplicates.threshold}
          </div>
        )}
      </div>

      {duplicates && duplicates.clusters.length > 0 && (
        <div className="space-y-4 max-h-[600px] overflow-y-auto">
          {duplicates.clusters.map((cluster) => (
            <ClusterRow key={cluster.groupId} cluster={cluster} onHide={onHide} onUnhide={onUnhide} />
          ))}
        </div>
      )}

      {duplicates && duplicates.clusters.length === 0 && (
        <div className="text-xs text-[var(--el-green-44)] border border-[var(--el-green-33)] p-4">
          No duplicate clusters found at threshold {duplicates.threshold}.
        </div>
      )}
    </div>
  );
}

function ClusterRow({
  cluster,
  onHide,
  onUnhide,
}: {
  cluster: DuplicateCluster;
  onHide: (ids: string[]) => void;
  onUnhide: (ids: string[]) => void;
}) {
  return (
    <div className="border border-[var(--el-flame-99)]/30 bg-[var(--el-flame-99)]/5 p-3">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-[10px] tracking-wider text-[var(--el-flame)]">
          CLUSTER #{cluster.groupId}
        </span>
        <span className="text-[10px] text-[var(--el-green-44)]">{cluster.photos.length} photos</span>
      </div>
      <div className="flex gap-3 overflow-x-auto pb-2">
        {cluster.photos.map((photo) => (
          <div
            key={photo.id}
            className={`flex-shrink-0 border p-2 ${
              photo.hidden ? "border-[var(--el-red-33)] opacity-50" : "border-[var(--el-green-33)]"
            }`}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={photo.thumbnailUrl}
              alt={photo.filename}
              className="w-32 h-24 object-cover mb-2"
              loading="lazy"
            />
            <div
              className="text-[9px] text-[var(--el-green-99)] truncate max-w-[128px]"
              title={photo.filename}
            >
              {photo.filename}
            </div>
            <div className="text-[9px] text-[var(--el-green-44)]">
              {photo.folder || "ROOT"} / d={photo.hammingDistance}
            </div>
            <div className="mt-1">
              {photo.hidden ? (
                <button
                  onClick={() => onUnhide([photo.id])}
                  className="text-[9px] tracking-wider border border-[var(--el-green-33)] px-2 py-0.5 text-[var(--el-green-44)] hover:border-[var(--el-green)] hover:text-[var(--el-green)] transition-colors"
                >
                  UNHIDE
                </button>
              ) : (
                <button
                  onClick={() => onHide([photo.id])}
                  className="text-[9px] tracking-wider border border-[var(--el-red-33)] px-2 py-0.5 text-[var(--el-red-88)] hover:border-[var(--el-red)] hover:text-[var(--el-red)] hover:bg-[var(--el-red-08)] transition-colors"
                >
                  HIDE
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
