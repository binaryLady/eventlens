// @TheTechMargin 2026
"use client";

import { useState, useCallback, useEffect } from "react";

interface StatusData {
  total: number;
  completed: number;
  pending: number;
  processing: number;
  errors: number;
  withEmbeddings: number;
  faceEmbeddings: number;
  lastProcessed: string | null;
  recentErrors: Array<{ filename: string; error: string }>;
  folders: Array<{ name: string; count: number }>;
}

interface ActionResult {
  message?: string;
  error?: string;
  output?: string;
  stderr?: string;
  hint?: string;
  [key: string]: unknown;
}

interface DuplicatePhoto {
  id: string;
  driveFileId: string;
  filename: string;
  folder: string;
  phash: number;
  hammingDistance: number;
  hidden: boolean;
  thumbnailUrl: string;
}

interface DuplicateCluster {
  groupId: number;
  photos: DuplicatePhoto[];
}

interface DuplicateData {
  clusters: DuplicateCluster[];
  totalClusters: number;
  totalDuplicates: number;
  threshold: number;
}

export default function AdminPage() {
  const [secret, setSecret] = useState("");
  const [authenticated, setAuthenticated] = useState(false);
  const [status, setStatus] = useState<StatusData | null>(null);
  const [loading, setLoading] = useState<string | null>(null);
  const [activityLog, setActivityLog] = useState<string[]>([]);
  const [duplicates, setDuplicates] = useState<DuplicateData | null>(null);
  const [dupsLoading, setDupsLoading] = useState(false);

  const addLog = useCallback((msg: string) => {
    setActivityLog((prev) => [...prev, `[${new Date().toLocaleTimeString()}] ${msg}`]);
  }, []);

  const headers = useCallback(
    () => ({
      Authorization: `Bearer ${secret}`,
      "Content-Type": "application/json",
    }),
    [secret],
  );

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/status", { headers: headers() });
      if (!res.ok) {
        if (res.status === 401) {
          setAuthenticated(false);
          return;
        }
        throw new Error(`Status fetch failed: ${res.status}`);
      }
      const contentType = res.headers.get("content-type");
      if (contentType && contentType.includes("application/json")) {
        const data: StatusData = await res.json();
        setStatus(data);
        setAuthenticated(true);
      } else {
        throw new Error("Unexpected response format");
      }
    } catch (error) {
      addLog(`Status error: ${error instanceof Error ? error.message : "Unknown"}`);
      setAuthenticated(false);
    }
  }, [headers, addLog]);

  const handleLogin = async () => {
    if (!secret) return;
    await fetchStatus();
  };

  useEffect(() => {
    if (!authenticated) return;
    const interval = setInterval(fetchStatus, 5000);
    return () => clearInterval(interval);
  }, [authenticated, fetchStatus]);

  const runPipeline = async (phase: string, label: string, options?: { retryErrors?: boolean }) => {
    setLoading(label);
    addLog(`Starting: ${label}...`);

    let keepPolling = true;
    let iteration = 0;
    let reqOptions = { ...options };

    while (keepPolling) {
      try {
        iteration++;
        const res = await fetch("/api/admin/pipeline", {
          method: "POST",
          headers: headers(),
          body: JSON.stringify({ phase, ...reqOptions }),
        });
        const contentType = res.headers.get("content-type");
        let data: ActionResult;
        if (contentType && contentType.includes("application/json")) {
          data = await res.json();
        } else {
          throw new Error("Unexpected response format");
        }
        if (!res.ok) {
          addLog(`ERROR: ${data.error || res.statusText}`);
          keepPolling = false;
        } else {
          const processed = (data.processed as number) || 0;
          const remaining = (data.remaining as number) || 0;
          const done = data.done as boolean;

          addLog(`  [${iteration}] ${data.phase || phase}: ${processed} processed, ${remaining} remaining`);

          if (data.errors && (data.errors as string[]).length > 0) {
            addLog(`  Errors: ${(data.errors as string[]).slice(0, 5).join(", ")}`);
          }

          await fetchStatus();

          if (done || remaining <= 0) {
            addLog(`Done: ${label}`);
            keepPolling = false;
          } else {
            // Only pass retryErrors on first iteration
            reqOptions = { ...reqOptions, retryErrors: false };
          }
        }
      } catch (error) {
        addLog(`ERROR: ${error instanceof Error ? error.message : "Network error"}`);
        keepPolling = false;
      }
    }

    setLoading(null);
  };

  const runAction = async (endpoint: string, method: string, label: string, body?: object) => {
    setLoading(label);
    addLog(`Starting: ${label}...`);
    try {
      const res = await fetch(endpoint, {
        method,
        headers: headers(),
        body: body ? JSON.stringify(body) : undefined,
      });
      const contentType = res.headers.get("content-type");
      let data: ActionResult;
      if (contentType && contentType.includes("application/json")) {
        data = await res.json();
      } else {
        throw new Error("Unexpected response format");
      }
      if (!res.ok) {
        addLog(`ERROR: ${data.error || res.statusText}`);
      } else {
        addLog(`Done: ${JSON.stringify(data)}`);
      }
      await fetchStatus();
    } catch (error) {
      addLog(`ERROR: ${error instanceof Error ? error.message : "Network error"}`);
    }
    setLoading(null);
  };

  const fetchDuplicates = async (threshold = 10) => {
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
  };

  const hidePhotos = async (ids: string[]) => {
    try {
      const res = await fetch("/api/admin/photos/hide", {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({ ids, hidden: true }),
      });
      if (res.ok) {
        addLog(`Hidden ${ids.length} photo(s)`);
        // Update local state
        setDuplicates((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            clusters: prev.clusters.map((c) => ({
              ...c,
              photos: c.photos.map((p) =>
                ids.includes(p.id) ? { ...p, hidden: true } : p,
              ),
            })),
          };
        });
      } else {
        const err = await res.json();
        addLog(`Hide error: ${err.error || res.statusText}`);
      }
    } catch (error) {
      addLog(`Hide error: ${error instanceof Error ? error.message : "Network error"}`);
    }
  };

  const unhidePhotos = async (ids: string[]) => {
    try {
      const res = await fetch("/api/admin/photos/hide", {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({ ids, hidden: false }),
      });
      if (res.ok) {
        addLog(`Unhidden ${ids.length} photo(s)`);
        setDuplicates((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            clusters: prev.clusters.map((c) => ({
              ...c,
              photos: c.photos.map((p) =>
                ids.includes(p.id) ? { ...p, hidden: false } : p,
              ),
            })),
          };
        });
      }
    } catch (error) {
      addLog(`Unhide error: ${error instanceof Error ? error.message : "Network error"}`);
    }
  };

  if (!authenticated) {
    return (
      <div className="min-h-screen bg-[var(--el-bg)] flex items-center justify-center p-4">
        <div className="border border-[var(--el-green-33)] bg-[rgba(26,26,26,0.8)] p-8 max-w-md w-full">
          <h1 className="text-[var(--el-green)] font-mono text-lg mb-6 tracking-wider">
            ADMIN ACCESS
          </h1>
          <input
            type="password"
            value={secret}
            onChange={(e) => setSecret(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleLogin()}
            placeholder="ADMIN_API_SECRET"
            className="w-full bg-[var(--el-bg)] border border-[var(--el-green-33)] text-[var(--el-green)] font-mono text-sm px-4 py-3 mb-4 focus:border-[var(--el-green)] focus:outline-none placeholder:text-[var(--el-magenta)]"
          />
          <button
            onClick={handleLogin}
            className="w-full border border-[var(--el-green-99)] text-[var(--el-green-99)] font-mono text-sm px-4 py-3 hover:bg-[var(--el-magenta-28)] hover:border-[var(--el-magenta)] hover:text-[var(--el-magenta)] transition-colors tracking-wider"
          >
            AUTHENTICATE
          </button>
        </div>
      </div>
    );
  }

  const pct = status && status.total > 0 ? Math.round((status.completed / status.total) * 100) : 0;

  return (
    <div className="min-h-screen bg-[var(--el-bg)] text-[var(--el-green)] font-mono p-4 md:p-8">
      <div className="max-w-5xl mx-auto">
        <h1 className="text-xl tracking-wider mb-8 border-b border-[var(--el-green-33)] pb-4">
          PHOTO PIPELINE CONTROL
        </h1>

        {status && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
            <StatusCard label="TOTAL PHOTOS" value={status.total} />
            <StatusCard label="COMPLETED" value={status.completed} color="var(--el-green)" />
            <StatusCard label="PENDING" value={status.pending} color="var(--el-amber)" />
            <StatusCard label="ERRORS" value={status.errors} color={status.errors > 0 ? "var(--el-red)" : undefined} />
            <StatusCard label="TEXT EMBEDDINGS" value={status.withEmbeddings} color="var(--el-cyan)" />
            <StatusCard label="FACE EMBEDDINGS" value={status.faceEmbeddings} color="var(--el-purple)" />
            <StatusCard label="PROCESSING" value={status.processing} color="var(--el-blue)" />
            <StatusCard label="PROGRESS" value={pct} suffix="%" color="var(--el-green)" />
          </div>
        )}

        {status && status.total > 0 && (
          <div className="mb-6">
            <div className="w-full h-2 bg-[var(--el-green-11)] border border-[var(--el-green-33)]">
              <div
                className="h-full bg-[var(--el-green)] transition-all duration-500"
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        )}

        {status && status.folders.length > 0 && (
          <div className="mb-6">
            <h2 className="text-xs tracking-wider mb-2 text-[var(--el-green-99)]">FOLDERS</h2>
            <div className="flex flex-wrap gap-2">
              {status.folders.map((f) => (
                <span
                  key={f.name}
                  className="border border-[var(--el-green-33)] px-2 py-1 text-[10px] tracking-wider text-[var(--el-green-99)]"
                >
                  {f.name || "ROOT"} [{f.count}]
                </span>
              ))}
            </div>
          </div>
        )}

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
              onClick={async () => {
                setLoading("refresh");
                await fetchStatus();
                addLog("Status refreshed");
                setLoading(null);
              }}
            />
            <ActionButton
              label="CLEAR LOG"
              description="Reset activity log"
              loading={false}
              disabled={false}
              onClick={() => setActivityLog([])}
            />
          </div>
        </div>

        <div className="mb-8">
          <h2 className="text-sm tracking-wider mb-3 text-[var(--el-flame)]">DUPLICATES</h2>
          <div className="flex items-center gap-3 mb-4">
            <ActionButton
              label="SCAN DUPLICATES"
              description="Find near-duplicate photo clusters"
              loading={dupsLoading}
              disabled={dupsLoading}
              onClick={() => fetchDuplicates()}
            />
            {duplicates && (
              <div className="text-xs text-[var(--el-flame-99)]">
                {duplicates.totalClusters} clusters / {duplicates.totalDuplicates} photos / threshold: {duplicates.threshold}
              </div>
            )}
          </div>
          {duplicates && duplicates.clusters.length > 0 && (
            <div className="space-y-4 max-h-[600px] overflow-y-auto">
              {duplicates.clusters.map((cluster) => (
                <DuplicateClusterRow
                  key={cluster.groupId}
                  cluster={cluster}
                  onHide={hidePhotos}
                  onUnhide={unhidePhotos}
                />
              ))}
            </div>
          )}
          {duplicates && duplicates.clusters.length === 0 && (
            <div className="text-xs text-[var(--el-green-44)] border border-[var(--el-green-33)] p-4">
              No duplicate clusters found at threshold {duplicates.threshold}.
            </div>
          )}
        </div>

        {status && status.recentErrors.length > 0 && (
          <div className="mb-8">
            <h2 className="text-sm tracking-wider mb-3 text-[var(--el-red)]">
              RECENT ERRORS
            </h2>
            <div className="border border-[var(--el-red-33)] bg-[var(--el-red-08)] max-h-40 overflow-y-auto">
              {status.recentErrors.map((e, i) => (
                <div key={i} className="px-3 py-2 text-xs border-b border-[var(--el-red-11)] last:border-0">
                  <span className="text-[var(--el-red)]">{e.filename}</span>
                  <span className="text-[var(--el-red-88)] ml-2">{e.error}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div>
          <h2 className="text-sm tracking-wider mb-3 text-[var(--el-green-99)]">
            ACTIVITY LOG
          </h2>
          <div className="border border-[var(--el-green-33)] bg-[var(--el-green-08)] h-48 overflow-y-auto p-3">
            {activityLog.length === 0 ? (
              <p className="text-xs text-[var(--el-green-44)]">
                No activity yet. Use Pipeline buttons above to process photos.
              </p>
            ) : (
              activityLog.map((entry, i) => (
                <div key={i} className="text-xs text-[var(--el-green-99)] mb-1">{entry}</div>
              ))
            )}
          </div>
        </div>

        {status?.lastProcessed && (
          <div className="mt-4 text-xs text-[var(--el-green-44)]">
            Last indexed: {new Date(status.lastProcessed).toLocaleString()}
          </div>
        )}
      </div>
    </div>
  );
}

function StatusCard({
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

function ActionButton({
  label,
  description,
  loading,
  disabled,
  onClick,
}: {
  label: string;
  description: string;
  loading: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`border p-3 text-left transition-colors ${
        disabled
          ? "border-[var(--el-amber)]/20 text-[var(--el-amber)]/40 cursor-not-allowed"
          : "border-[var(--el-green-33)] text-[var(--el-green-99)] hover:border-[var(--el-magenta)] hover:bg-[var(--el-magenta-28)]"
      }`}
    >
      <div className="text-xs tracking-wider flex items-center gap-2">
        {loading && <span className="inline-block w-2 h-2 bg-[var(--el-green)] animate-pulse" />}
        {label}
      </div>
      <div className="text-[10px] text-[var(--el-green-44)] mt-1">{description}</div>
    </button>
  );
}

function DuplicateClusterRow({
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
        <span className="text-[10px] text-[var(--el-green-44)]">
          {cluster.photos.length} photos
        </span>
      </div>
      <div className="flex gap-3 overflow-x-auto pb-2">
        {cluster.photos.map((photo) => (
          <div
            key={photo.id}
            className={`flex-shrink-0 border p-2 ${
              photo.hidden
                ? "border-[var(--el-red-33)] opacity-50"
                : "border-[var(--el-green-33)]"
            }`}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={photo.thumbnailUrl}
              alt={photo.filename}
              className="w-32 h-24 object-cover mb-2"
              loading="lazy"
            />
            <div className="text-[9px] text-[var(--el-green-99)] truncate max-w-[128px]" title={photo.filename}>
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
