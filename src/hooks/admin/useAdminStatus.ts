// @TheTechMargin 2026
// Pipeline status polling — fetches status on interval, handles auth expiry.

import { useState, useCallback, useEffect } from "react";
import type { StatusData } from "@/app/admin/types";

interface UseAdminStatusOptions {
  headers: () => Record<string, string>;
  authenticated: boolean;
  setAuthenticated: (v: boolean) => void;
  addLog: (msg: string) => void;
}

export function useAdminStatus({
  headers,
  authenticated,
  setAuthenticated,
  addLog,
}: UseAdminStatusOptions) {
  const [status, setStatus] = useState<StatusData | null>(null);

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
  }, [headers, addLog, setAuthenticated]);

  // Poll every 5s while authenticated
  useEffect(() => {
    if (!authenticated) return;
    const interval = setInterval(fetchStatus, 5000);
    return () => clearInterval(interval);
  }, [authenticated, fetchStatus]);

  return { status, fetchStatus };
}
