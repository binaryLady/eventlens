"use client";

import { useState, useCallback, useEffect } from "react";

interface StatusData {
  total: number;
  completed: number;
  pending: number;
  processing: number;
  errors: number;
  lastProcessed: string | null;
  recentErrors: Array<{ filename: string; error: string }>;
}

interface ActionResult {
  message?: string;
  error?: string;
  [key: string]: unknown;
}

export default function AdminPage() {
  const [secret, setSecret] = useState("");
  const [authenticated, setAuthenticated] = useState(false);
  const [status, setStatus] = useState<StatusData | null>(null);
  const [loading, setLoading] = useState<string | null>(null);
  const [log, setLog] = useState<string[]>([]);

  const addLog = useCallback((msg: string) => {
    setLog((prev) => [...prev, `[${new Date().toLocaleTimeString()}] ${msg}`]);
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
      const data: StatusData = await res.json();
      setStatus(data);
      setAuthenticated(true);
    } catch (error) {
      addLog(
        `Status error: ${error instanceof Error ? error.message : "Unknown"}`,
      );
    }
  }, [headers, addLog]);

  const handleLogin = async () => {
    if (!secret) return;
    await fetchStatus();
  };

  // Poll status every 5s while authenticated
  useEffect(() => {
    if (!authenticated) return;
    const interval = setInterval(fetchStatus, 5000);
    return () => clearInterval(interval);
  }, [authenticated, fetchStatus]);

  const runAction = async (
    endpoint: string,
    method: string,
    label: string,
    body?: object,
  ) => {
    setLoading(label);
    addLog(`Starting: ${label}...`);

    try {
      const res = await fetch(endpoint, {
        method,
        headers: headers(),
        body: body ? JSON.stringify(body) : undefined,
      });

      const data: ActionResult = await res.json();

      if (!res.ok) {
        addLog(`ERROR: ${data.error || res.statusText}`);
      } else {
        addLog(`Done: ${JSON.stringify(data)}`);
      }

      await fetchStatus();
    } catch (error) {
      addLog(
        `ERROR: ${error instanceof Error ? error.message : "Network error"}`,
      );
    }

    setLoading(null);
  };

  // ── Login screen ──────────────────────────────────────────────────────

  if (!authenticated) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center p-4">
        <div className="border border-[#00ff4133] bg-black/80 p-8 max-w-md w-full">
          <h1 className="text-[#00ff41] font-mono text-lg mb-6 tracking-wider">
            ADMIN ACCESS
          </h1>
          <input
            type="password"
            value={secret}
            onChange={(e) => setSecret(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleLogin()}
            placeholder="ADMIN_API_SECRET"
            className="w-full bg-black border border-[#00ff4133] text-[#00ff41] font-mono text-sm px-4 py-3 mb-4 focus:border-[#00ff41] focus:outline-none placeholder:text-[#00ff4144]"
          />
          <button
            onClick={handleLogin}
            className="w-full border border-[#00ff41] text-[#00ff41] font-mono text-sm px-4 py-3 hover:bg-[#00ff4111] transition-colors tracking-wider"
          >
            AUTHENTICATE
          </button>
        </div>
      </div>
    );
  }

  // ── Admin dashboard ───────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-black text-[#00ff41] font-mono p-4 md:p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-xl tracking-wider mb-8 border-b border-[#00ff4133] pb-4">
          PHOTO INDEXING CONTROL
        </h1>

        {/* Status Dashboard */}
        {status && (
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-8">
            <StatusCard label="TOTAL" value={status.total} />
            <StatusCard
              label="COMPLETED"
              value={status.completed}
              color="#00ff41"
            />
            <StatusCard
              label="PENDING"
              value={status.pending}
              color="#ffaa00"
            />
            <StatusCard
              label="PROCESSING"
              value={status.processing}
              color="#00aaff"
            />
            <StatusCard
              label="ERRORS"
              value={status.errors}
              color="#ff4444"
            />
          </div>
        )}

        {/* Progress Bar */}
        {status && status.total > 0 && (
          <div className="mb-8">
            <div className="flex justify-between text-xs mb-1 text-[#00ff4199]">
              <span>INDEXING PROGRESS</span>
              <span>
                {Math.round((status.completed / status.total) * 100)}%
              </span>
            </div>
            <div className="w-full h-2 bg-[#00ff4111] border border-[#00ff4133]">
              <div
                className="h-full bg-[#00ff41] transition-all duration-500"
                style={{
                  width: `${(status.completed / status.total) * 100}%`,
                }}
              />
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
          <ActionButton
            label="SCAN DRIVE"
            description="Find new images"
            loading={loading === "scan"}
            disabled={loading !== null}
            onClick={() =>
              runAction("/api/admin/scan", "POST", "scan")
            }
          />
          <ActionButton
            label="INDEX BATCH"
            description="Process 5 photos"
            loading={loading === "index"}
            disabled={loading !== null}
            onClick={() =>
              runAction("/api/admin/index", "POST", "index", {
                batchSize: 5,
              })
            }
          />
          <ActionButton
            label="INDEX ALL"
            description="Process all pending"
            loading={loading === "index-all"}
            disabled={loading !== null}
            onClick={() =>
              runAction("/api/admin/index", "POST", "index-all", {
                batchSize: 5,
                continue: true,
              })
            }
          />
          <ActionButton
            label="RETRY ERRORS"
            description="Reprocess failed"
            loading={loading === "retry"}
            disabled={loading !== null || (status?.errors || 0) === 0}
            onClick={() =>
              runAction("/api/admin/index", "POST", "retry", {
                retryErrors: true,
              })
            }
          />
        </div>

        {/* Recent Errors */}
        {status && status.recentErrors.length > 0 && (
          <div className="mb-8">
            <h2 className="text-sm tracking-wider mb-3 text-[#ff4444]">
              RECENT ERRORS
            </h2>
            <div className="border border-[#ff444433] bg-[#ff444408] max-h-40 overflow-y-auto">
              {status.recentErrors.map((e, i) => (
                <div
                  key={i}
                  className="px-3 py-2 text-xs border-b border-[#ff444411] last:border-0"
                >
                  <span className="text-[#ff4444]">{e.filename}</span>
                  <span className="text-[#ff444488] ml-2">{e.error}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Activity Log */}
        <div>
          <h2 className="text-sm tracking-wider mb-3 text-[#00ff4199]">
            ACTIVITY LOG
          </h2>
          <div className="border border-[#00ff4133] bg-[#00ff4108] h-64 overflow-y-auto p-3">
            {log.length === 0 ? (
              <p className="text-xs text-[#00ff4144]">
                No activity yet. Use the controls above to scan and index photos.
              </p>
            ) : (
              log.map((entry, i) => (
                <div key={i} className="text-xs text-[#00ff4199] mb-1">
                  {entry}
                </div>
              ))
            )}
          </div>
        </div>

        {/* Last processed */}
        {status?.lastProcessed && (
          <div className="mt-4 text-xs text-[#00ff4144]">
            Last indexed: {new Date(status.lastProcessed).toLocaleString()}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Sub-components ──────────────────────────────────────────────────────

function StatusCard({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color?: string;
}) {
  return (
    <div className="border border-[#00ff4133] p-3 text-center">
      <div
        className="text-2xl font-bold mb-1"
        style={{ color: color || "#00ff4199" }}
      >
        {value}
      </div>
      <div className="text-[10px] tracking-wider text-[#00ff4166]">
        {label}
      </div>
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
          ? "border-[#00ff4111] text-[#00ff4133] cursor-not-allowed"
          : "border-[#00ff4133] text-[#00ff41] hover:border-[#00ff41] hover:bg-[#00ff4108]"
      }`}
    >
      <div className="text-xs tracking-wider flex items-center gap-2">
        {loading && (
          <span className="inline-block w-2 h-2 bg-[#00ff41] animate-pulse" />
        )}
        {label}
      </div>
      <div className="text-[10px] text-[#00ff4144] mt-1">{description}</div>
    </button>
  );
}
