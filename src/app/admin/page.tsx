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

export default function AdminPage() {
  const [secret, setSecret] = useState("");
  const [authenticated, setAuthenticated] = useState(false);
  const [status, setStatus] = useState<StatusData | null>(null);
  const [loading, setLoading] = useState<string | null>(null);
  const [activityLog, setActivityLog] = useState<string[]>([]);

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
    try {
      const res = await fetch("/api/admin/pipeline", {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({ phase, ...options }),
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
        if (data.stderr) addLog(`STDERR: ${data.stderr.slice(0, 300)}`);
        if (data.hint) addLog(`HINT: ${data.hint}`);
      } else {
        addLog(`Done: ${label}`);
        if (data.output) {
          const lines = data.output.trim().split("\n");
          const lastLines = lines.slice(-5);
          for (const line of lastLines) {
            addLog(`  ${line}`);
          }
        }
      }
      await fetchStatus();
    } catch (error) {
      addLog(`ERROR: ${error instanceof Error ? error.message : "Network error"}`);
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

  // Login screen
  if (!authenticated) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center p-4">
        <div className="border border-[var(--el-green-33)] bg-black/80 p-8 max-w-md w-full">
          <h1 className="text-[var(--el-green)] font-mono text-lg mb-6 tracking-wider">
            ADMIN ACCESS
          </h1>
          <input
            type="password"
            value={secret}
            onChange={(e) => setSecret(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleLogin()}
            placeholder="ADMIN_API_SECRET"
            className="w-full bg-black border border-[var(--el-green-33)] text-[var(--el-green)] font-mono text-sm px-4 py-3 mb-4 focus:border-[var(--el-green)] focus:outline-none placeholder:text-[var(--el-magenta)]"
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
    <div className="min-h-screen bg-black text-[var(--el-green)] font-mono p-4 md:p-8">
      <div className="max-w-5xl mx-auto">
        <h1 className="text-xl tracking-wider mb-8 border-b border-[var(--el-green-33)] pb-4">
          PHOTO PIPELINE CONTROL
        </h1>

        {/* Status Dashboard */}
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

        {/* Progress Bar */}
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

        {/* Folder Breakdown */}
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

        {/* Pipeline Actions */}
        <div className="mb-8">
          <h2 className="text-sm tracking-wider mb-3 text-[var(--el-green-99)]">PIPELINE</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <ActionButton
              label="SCAN DRIVE"
              description="Discover new images from Drive folders"
              loading={loading === "scan"}
              disabled={loading !== null}
              onClick={() => runAction("/api/admin/scan", "POST", "scan")}
            />
            <ActionButton
              label="FULL PIPELINE"
              description="Scan + describe + text embeddings"
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
              label="RETRY ERRORS"
              description="Re-process failed photos"
              loading={loading === "retry"}
              disabled={loading !== null}
              onClick={() => runPipeline("describe", "retry", { retryErrors: true })}
            />
          </div>
        </div>

        {/* Utility Actions */}
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

        {/* Recent Errors */}
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

        {/* Activity Log */}
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

// Sub-components

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
