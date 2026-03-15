// @TheTechMargin 2026
// Pipeline execution — runs phases in a polling loop, tracks loading state.
// The loop re-calls the pipeline until `done: true` or an error occurs,
// handling Vercel's 300s serverless timeout transparently.

import { useState, useCallback } from "react";
import type { ActionResult } from "@/app/admin/types";

interface UseAdminPipelineOptions {
  headers: () => Record<string, string>;
  addLog: (msg: string) => void;
  fetchStatus: () => Promise<void>;
}

export function useAdminPipeline({
  headers,
  addLog,
  fetchStatus,
}: UseAdminPipelineOptions) {
  const [loading, setLoading] = useState<string | null>(null);

  const runPipeline = useCallback(
    async (phase: string, label: string, options?: { retryErrors?: boolean }) => {
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
            const processed = data.processed || 0;
            const remaining = data.remaining || 0;
            const done = data.done;

            addLog(
              `  [${iteration}] ${data.phase || phase}: ${processed} processed, ${remaining} remaining`,
            );

            if (data.errors && data.errors.length > 0) {
              addLog(`  Errors: ${data.errors.slice(0, 5).join(", ")}`);
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
    },
    [headers, addLog, fetchStatus],
  );

  return { loading, runPipeline };
}
