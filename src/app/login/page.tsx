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
        <div className="border border-[#00ff4133] bg-black/80 p-6 backdrop-blur">
          {/* Terminal header */}
          <div className="flex items-center gap-2 border-b border-[#00ff4122] pb-3 mb-6">
            <div className="h-2 w-2 rounded-full bg-[#00ff41]" />
            <div className="h-2 w-2 rounded-full bg-[#00ff4166]" />
            <div className="h-2 w-2 rounded-full bg-[#00ff4133]" />
            <span className="ml-2 text-[10px] uppercase tracking-widest text-[#00ff4166]">
              eventlens://auth
            </span>
          </div>

          {/* Content */}
          <div className="space-y-6">
            <div>
              <h1 className="text-lg font-bold text-[#00ff41] uppercase tracking-wider mb-2">
                ACCESS REQUIRED
              </h1>
              <p className="text-xs text-[#00ff4166] uppercase tracking-wider">
                Enter your access credential to continue
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label
                  htmlFor="password"
                  className="block text-[10px] uppercase tracking-wider text-[#00ff4166] mb-2"
                >
                  PASSWORD
                </label>
                <input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full bg-black border border-[#00ff4133] px-3 py-2 text-xs text-[#00ff41] placeholder-[#00ff4133] focus:border-[#00ff41] focus:outline-none transition-colors"
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
                className="w-full border border-[#00ff41] bg-[#00ff4111] px-4 py-2 text-xs font-bold uppercase tracking-wider text-[#00ff41] hover:bg-[#00ff4122] focus:outline-none focus:ring-1 focus:ring-[#00ff41] disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              >
                {loading ? "VERIFYING..." : "AUTHENTICATE"}
              </button>
            </form>

            <div className="border-t border-[#00ff4122] pt-4">
              <p className="text-[10px] text-[#00ff4144] uppercase tracking-widest">
                © @TheTechMargin 2026
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
