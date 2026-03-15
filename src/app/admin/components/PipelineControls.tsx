// @TheTechMargin 2026
// Pipeline phase controls — run individual phases or full pipeline.

import { ActionButton } from "./ActionButton";

interface PipelineControlsProps {
  loading: string | null;
  runPipeline: (phase: string, label: string, options?: { retryErrors?: boolean }) => void;
  onRefresh: () => void;
  onClearLog: () => void;
}

export function PipelineControls({
  loading,
  runPipeline,
  onRefresh,
  onClearLog,
}: PipelineControlsProps) {
  return (
    <>
      <div className="mb-8">
        <h2 className="text-sm tracking-wider mb-3 text-[var(--el-green-99)]">PIPELINE</h2>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <ActionButton
            label="SYNC METADATA"
            description="Reconcile Drive renames/moves/deletions"
            loading={loading === "sync"}
            disabled={loading !== null}
            onClick={() => runPipeline("sync", "sync")}
          />
          <ActionButton
            label="SCAN DRIVE"
            description="Discover new images from Drive folders"
            loading={loading === "scan"}
            disabled={loading !== null}
            onClick={() => runPipeline("scan", "scan")}
          />
          <ActionButton
            label="FULL PIPELINE"
            description="Sync + scan + describe + embed + phash"
            loading={loading === "full"}
            disabled={loading !== null}
            onClick={() => runPipeline("full", "full")}
          />
          <ActionButton
            label="DESCRIBE + EMBED"
            description="Gemini descriptions + text embeddings"
            loading={loading === "describe"}
            disabled={loading !== null}
            onClick={() => runPipeline("describe", "describe")}
          />
          <ActionButton
            label="TEXT EMBEDDINGS"
            description="Embed already-described photos"
            loading={loading === "embeddings"}
            disabled={loading !== null}
            onClick={() => runPipeline("embeddings", "embeddings")}
          />
          <ActionButton
            label="FACE EMBEDDINGS"
            description="InsightFace embeddings (needs face-api)"
            loading={loading === "face-embed"}
            disabled={loading !== null}
            onClick={() => runPipeline("face-embed", "face-embed")}
          />
          <ActionButton
            label="PHASH"
            description="Compute perceptual hashes for dedup"
            loading={loading === "phash"}
            disabled={loading !== null}
            onClick={() => runPipeline("phash", "phash")}
          />
          <ActionButton
            label="RETRY ERRORS"
            description="Re-process failed photos"
            loading={loading === "retry"}
            disabled={loading !== null}
            onClick={() => runPipeline("describe", "retry", { retryErrors: true })}
          />
        </div>
      </div>

      <div className="mb-8">
        <h2 className="text-sm tracking-wider mb-3 text-[var(--el-green-99)]">UTILITIES</h2>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <ActionButton
            label="REFRESH STATUS"
            description="Re-fetch pipeline status"
            loading={loading === "refresh"}
            disabled={loading !== null}
            onClick={onRefresh}
          />
          <ActionButton
            label="CLEAR LOG"
            description="Reset activity log"
            loading={false}
            disabled={false}
            onClick={onClearLog}
          />
        </div>
      </div>
    </>
  );
}
