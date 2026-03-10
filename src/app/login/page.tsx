// @TheTechMargin 2026
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Authentication failed");
        setLoading(false);
        return;
      }

      router.push("/");
    } catch {
      setError("Network error — please try again");
      setLoading(false);
    }
  };

  return (
    <div
      className="w-full h-full bg-black text-zinc-100 font-mono flex items-center justify-center p-4 scan-line-bg"
    >
      <div className="w-full max-w-sm">
        {/* Terminal window */}
        <div className="border border-[var(--el-magenta-cc)] bg-black/80 p-6 backdrop-blur">
          {/* Terminal header */}
          <div className="flex items-center gap-2 border-b border-[var(--el-magenta-bb)] pb-3 mb-6">
            <div className="h-2 w-2 rounded-full bg-[var(--el-green)]" />
            <div className="h-2 w-2 rounded-full bg-[var(--el-magenta-dd)]" />
            <div className="h-2 w-2 rounded-full bg-[var(--el-magenta-cc)]" />
            <span className="ml-2 text-[10px] uppercase tracking-widest text-[var(--el-magenta-dd)]">
              eventlens://auth
            </span>
          </div>

          {/* Content */}
          <div className="space-y-6">
            <div>
              <h1 className="text-lg font-bold text-[var(--el-green)] uppercase tracking-wider mb-2">
                ACCESS REQUIRED
              </h1>
              <p className="text-xs text-[var(--el-magenta-dd)] uppercase tracking-wider">
                Enter your access credential to continue
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label
                  htmlFor="password"
                  className="block text-[10px] uppercase tracking-wider text-[var(--el-magenta-dd)] mb-2"
                >
                  PASSWORD
                </label>
                <input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full bg-black border border-[var(--el-magenta-cc)] px-3 py-2 text-xs text-[var(--el-green)] placeholder-[var(--el-magenta-cc)] focus:border-[var(--el-green)] focus:outline-none transition-colors"
                  disabled={loading}
                  autoFocus
                />
              </div>

              {error && (
                <div className="text-xs text-red-500 uppercase tracking-wider border border-red-500/30 bg-red-500/5 px-3 py-2">
                  ✗ {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full border border-[var(--el-green)] bg-[var(--el-green-11)] px-4 py-2 text-xs font-bold uppercase tracking-wider text-[var(--el-green)] hover:bg-[var(--el-green-22)] focus:outline-none focus:ring-1 focus:ring-[var(--el-green)] disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              >
                {loading ? "VERIFYING..." : "AUTHENTICATE"}
              </button>
            </form>

            <div className="border-t border-[var(--el-magenta-bb)] pt-4">
              <p className="text-[10px] text-[var(--el-magenta-bb)] uppercase tracking-widest">
                © @TheTechMargin 2026
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
