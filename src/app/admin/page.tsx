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
  [key: string]: unknown;
}

const PIPELINE_COMMANDS = [
  {
    label: "FULL PIPELINE",
    desc: "Scan + describe + embed (skip rename without OAuth)",
    cmd: "scripts/.venv/bin/python scripts/process_photos.py --skip-rename --skip-face-embed",
  },
  {
    label: "SCAN ONLY",
    desc: "Discover new photos from Drive",
    cmd: "scripts/.venv/bin/python scripts/process_photos.py --only-scan",
  },
  {
    label: "DESCRIBE + EMBED",
    desc: "Gemini descriptions + text embeddings",
    cmd: "scripts/.venv/bin/python scripts/process_photos.py --only-describe",
  },
  {
    label: "TEXT EMBEDDINGS ONLY",
    desc: "Embed already-described photos",
    cmd: "scripts/.venv/bin/python scripts/process_photos.py --only-embeddings",
  },
  {
    label: "FACE EMBEDDINGS",
    desc: "InsightFace embeddings (needs face-api running)",
    cmd: "scripts/.venv/bin/python scripts/process_photos.py --only-face-embed --face-api-url http://localhost:8080",
  },
  {
    label: "RENAME FILES",
    desc: "Rename in Drive (needs OAuth credentials.json)",
    cmd: "scripts/.venv/bin/python scripts/process_photos.py --only-rename --oauth-creds credentials.json",
  },
  {
    label: "RETRY ERRORS",
    desc: "Re-process failed photos",
    cmd: "scripts/.venv/bin/python scripts/process_photos.py --only-describe --retry-errors",
  },
  {
    label: "DRY RUN",
    desc: "Preview all operations without changes",
    cmd: "scripts/.venv/bin/python scripts/process_photos.py --dry-run --verbose",
  },
];

export default function AdminPage() {
  const [secret, setSecret] = useState("");
  const [authenticated, setAuthenticated] = useState(false);
  const [status, setStatus] = useState<StatusData | null>(null);
  const [loading, setLoading] = useState<string | null>(null);
  const [activityLog, setActivityLog] = useState<string[]>([]);
  const [copied, setCopied] = useState<string | null>(null);

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

  const copyCommand = (cmd: string, label: string) => {
    navigator.clipboard.writeText(cmd);
    setCopied(label);
    addLog(`Copied: ${label}`);
    setTimeout(() => setCopied(null), 2000);
  };

  // ── Login screen ──
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

  // ── Admin dashboard ──
  const pct = status && status.total > 0 ? Math.round((status.completed / status.total) * 100) : 0;

  return (
    <div className="min-h-screen bg-black text-[#00ff41] font-mono p-4 md:p-8">
      <div className="max-w-5xl mx-auto">
        <h1 className="text-xl tracking-wider mb-8 border-b border-[#00ff4133] pb-4">
          PHOTO PIPELINE CONTROL
        </h1>

        {/* Status Dashboard */}
        {status && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
            <StatusCard label="TOTAL PHOTOS" value={status.total} />
            <StatusCard label="COMPLETED" value={status.completed} color="#00ff41" />
            <StatusCard label="PENDING" value={status.pending} color="#ffaa00" />
            <StatusCard label="ERRORS" value={status.errors} color={status.errors > 0 ? "#ff4444" : undefined} />
            <StatusCard label="TEXT EMBEDDINGS" value={status.withEmbeddings} color="#00ccff" />
            <StatusCard label="FACE EMBEDDINGS" value={status.faceEmbeddings} color="#cc88ff" />
            <StatusCard label="PROCESSING" value={status.processing} color="#00aaff" />
            <StatusCard label="PROGRESS" value={pct} suffix="%" color="#00ff41" />
          </div>
        )}

        {/* Progress Bar */}
        {status && status.total > 0 && (
          <div className="mb-6">
            <div className="w-full h-2 bg-[#00ff4111] border border-[#00ff4133]">
              <div
                className="h-full bg-[#00ff41] transition-all duration-500"
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        )}

        {/* Folder Breakdown */}
        {status && status.folders.length > 0 && (
          <div className="mb-6">
            <h2 className="text-xs tracking-wider mb-2 text-[#00ff4199]">FOLDERS</h2>
            <div className="flex flex-wrap gap-2">
              {status.folders.map((f) => (
                <span
                  key={f.name}
                  className="border border-[#00ff4133] px-2 py-1 text-[10px] tracking-wider text-[#00ff4199]"
                >
                  {f.name || "ROOT"} [{f.count}]
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Quick Actions (server-side) */}
        <div className="mb-8">
          <h2 className="text-sm tracking-wider mb-3 text-[#00ff4199]">QUICK ACTIONS</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <ActionButton
              label="SCAN DRIVE"
              description="Discover new images from Drive"
              loading={loading === "scan"}
              disabled={loading !== null}
              onClick={() => runAction("/api/admin/scan", "POST", "scan")}
            />
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

        {/* Pipeline Commands */}
        <div className="mb-8">
          <h2 className="text-sm tracking-wider mb-2 text-[#00ff4199]">
            PIPELINE COMMANDS
          </h2>
          <p className="text-[10px] text-[#00ff4155] mb-3">
            Run these from the project root. Click to copy.
          </p>
          <div className="grid gap-2">
            {PIPELINE_COMMANDS.map((c) => (
              <button
                key={c.label}
                onClick={() => copyCommand(c.cmd, c.label)}
                className={`border text-left px-3 py-2 transition-all group ${
                  copied === c.label
                    ? "border-[#00ff41] bg-[#00ff4111]"
                    : "border-[#00ff4122] hover:border-[#00ff4166] hover:bg-[#00ff4108]"
                }`}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-[10px] tracking-wider text-[#00ff4199]">
                      {c.label}
                    </span>
                    <span className="text-[10px] text-[#00ff4144] ml-2">{c.desc}</span>
                  </div>
                  <span className="text-[10px] text-[#00ff4144] group-hover:text-[#00ff4199]">
                    {copied === c.label ? "COPIED" : "COPY"}
                  </span>
                </div>
                <div className="text-[11px] text-[#00ff4166] mt-1 font-mono break-all">
                  $ {c.cmd}
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Setup Instructions */}
        <div className="mb-8 border border-[#00ff4122] p-4">
          <h2 className="text-sm tracking-wider mb-3 text-[#00ff4199]">SETUP</h2>
          <div className="text-[11px] text-[#00ff4166] space-y-2">
            <p>1. Install Python dependencies (one-time):</p>
            <code className="block bg-[#00ff4108] px-2 py-1 text-[#00ff4199]">
              python3 -m venv scripts/.venv && scripts/.venv/bin/pip install -r scripts/requirements.txt
            </code>
            <p className="mt-3">2. For file rename, create OAuth credentials in Google Cloud Console and download as credentials.json</p>
            <p className="mt-3">3. For face embeddings, start the InsightFace service:</p>
            <code className="block bg-[#00ff4108] px-2 py-1 text-[#00ff4199]">
              cd services/face-api && python app.py
            </code>
            <p className="mt-3">4. Run the migration in Supabase SQL Editor:</p>
            <code className="block bg-[#00ff4108] px-2 py-1 text-[#00ff4199]">
              supabase/migrations/003_description_embeddings.sql
            </code>
          </div>
        </div>

        {/* Recent Errors */}
        {status && status.recentErrors.length > 0 && (
          <div className="mb-8">
            <h2 className="text-sm tracking-wider mb-3 text-[#ff4444]">
              RECENT ERRORS
            </h2>
            <div className="border border-[#ff444433] bg-[#ff444408] max-h-40 overflow-y-auto">
              {status.recentErrors.map((e, i) => (
                <div key={i} className="px-3 py-2 text-xs border-b border-[#ff444411] last:border-0">
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
          <div className="border border-[#00ff4133] bg-[#00ff4108] h-48 overflow-y-auto p-3">
            {activityLog.length === 0 ? (
              <p className="text-xs text-[#00ff4144]">
                No activity yet. Use Quick Actions above or run pipeline commands from terminal.
              </p>
            ) : (
              activityLog.map((entry, i) => (
                <div key={i} className="text-xs text-[#00ff4199] mb-1">{entry}</div>
              ))
            )}
          </div>
        </div>

        {status?.lastProcessed && (
          <div className="mt-4 text-xs text-[#00ff4144]">
            Last indexed: {new Date(status.lastProcessed).toLocaleString()}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Sub-components ──

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
    <div className="border border-[#00ff4133] p-3 text-center">
      <div className="text-2xl font-bold mb-1" style={{ color: color || "#00ff4199" }}>
        {value.toLocaleString()}{suffix || ""}
      </div>
      <div className="text-[10px] tracking-wider text-[#00ff4166]">{label}</div>
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
        {loading && <span className="inline-block w-2 h-2 bg-[#00ff41] animate-pulse" />}
        {label}
      </div>
      <div className="text-[10px] text-[#00ff4144] mt-1">{description}</div>
    </button>
  );
}
