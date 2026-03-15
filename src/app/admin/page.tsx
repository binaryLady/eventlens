// @TheTechMargin 2026
// Admin dashboard — orchestrates hooks and components.
// Follows the same delegation pattern as page.tsx → PhotoGallery:
// the page wires state to UI, individual hooks own behavior,
// individual components own rendering.
"use client";

import { useState, useCallback } from "react";
import { useAdminAuth } from "@/hooks/admin/useAdminAuth";
import { useAdminStatus } from "@/hooks/admin/useAdminStatus";
import { useAdminPipeline } from "@/hooks/admin/useAdminPipeline";
import { useAdminDuplicates } from "@/hooks/admin/useAdminDuplicates";
import { AdminLogin } from "./components/AdminLogin";
import { StatusCards } from "./components/StatusCards";
import { FolderBreakdown } from "./components/FolderBreakdown";
import { PipelineControls } from "./components/PipelineControls";
import { DuplicateManager } from "./components/DuplicateManager";
import { ErrorList } from "./components/ErrorList";
import { ActivityLog } from "./components/ActivityLog";

export default function AdminPage() {
  const [activityLog, setActivityLog] = useState<string[]>([]);

  const addLog = useCallback((msg: string) => {
    setActivityLog((prev) => [...prev, `[${new Date().toLocaleTimeString()}] ${msg}`]);
  }, []);

  const auth = useAdminAuth();
  const { status, fetchStatus } = useAdminStatus({
    headers: auth.headers,
    authenticated: auth.authenticated,
    setAuthenticated: auth.setAuthenticated,
    addLog,
  });
  const { loading, runPipeline } = useAdminPipeline({
    headers: auth.headers,
    addLog,
    fetchStatus,
  });
  const { duplicates, dupsLoading, fetchDuplicates, hidePhotos, unhidePhotos } =
    useAdminDuplicates({
      headers: auth.headers,
      addLog,
    });

  if (!auth.authenticated) {
    return (
      <AdminLogin
        secret={auth.secret}
        setSecret={auth.setSecret}
        onLogin={fetchStatus}
      />
    );
  }

  return (
    <div className="min-h-screen bg-[var(--el-bg)] text-[var(--el-primary)] font-mono p-4 md:p-8">
      <div className="max-w-5xl mx-auto">
        <h1 className="text-xl tracking-wider mb-8 border-b border-[var(--el-primary-33)] pb-4">
          PHOTO PIPELINE CONTROL
        </h1>

        {status && <StatusCards status={status} />}
        {status && <FolderBreakdown folders={status.folders} />}

        <PipelineControls
          loading={loading}
          runPipeline={runPipeline}
          onRefresh={async () => {
            await fetchStatus();
            addLog("Status refreshed");
          }}
          onClearLog={() => setActivityLog([])}
        />

        <DuplicateManager
          duplicates={duplicates}
          dupsLoading={dupsLoading}
          onScan={() => fetchDuplicates()}
          onHide={hidePhotos}
          onUnhide={unhidePhotos}
        />

        {status && <ErrorList errors={status.recentErrors} />}

        <ActivityLog
          entries={activityLog}
          lastProcessed={status?.lastProcessed ?? null}
        />
      </div>
    </div>
  );
}
