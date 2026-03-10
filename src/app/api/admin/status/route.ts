// @TheTechMargin 2026
import { NextRequest, NextResponse } from "next/server";
import { verifyAuth } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase";

export async function GET(request: NextRequest) {
  if (!verifyAuth(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const supabase = createServerClient();

    const [completed, pending, processing, errors, total] = await Promise.all([
      supabase.from("photos").select("*", { count: "exact", head: true }).eq("status", "completed"),
      supabase.from("photos").select("*", { count: "exact", head: true }).eq("status", "pending"),
      supabase.from("photos").select("*", { count: "exact", head: true }).eq("status", "processing"),
      supabase.from("photos").select("*", { count: "exact", head: true }).eq("status", "error"),
      supabase.from("photos").select("*", { count: "exact", head: true }),
    ]);

    // Count photos with description embeddings
    const { count: withEmbeddings } = await supabase
      .from("photos")
      .select("*", { count: "exact", head: true })
      .not("description_embedding", "is", null);

    // Count face embeddings (distinct files)
    const { data: faceData } = await supabase
      .from("face_embeddings")
      .select("drive_file_id")
      .limit(10000);
    const faceEmbeddings = new Set(faceData?.map((r) => r.drive_file_id)).size;

    // Folder breakdown
    const { data: folderData } = await supabase
      .from("photos")
      .select("folder");
    const folderCounts: Record<string, number> = {};
    for (const row of folderData || []) {
      const f = row.folder || "";
      folderCounts[f] = (folderCounts[f] || 0) + 1;
    }
    const folders = Object.entries(folderCounts)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);

    const { data: lastProcessed } = await supabase
      .from("photos")
      .select("processed_at")
      .eq("status", "completed")
      .order("processed_at", { ascending: false })
      .limit(1);

    const { data: recentErrors } = await supabase
      .from("photos")
      .select("filename, error_message")
      .eq("status", "error")
      .order("created_at", { ascending: false })
      .limit(10);

    return NextResponse.json({
      total: total.count || 0,
      completed: completed.count || 0,
      pending: pending.count || 0,
      processing: processing.count || 0,
      errors: errors.count || 0,
      withEmbeddings: withEmbeddings || 0,
      faceEmbeddings,
      folders,
      lastProcessed: lastProcessed?.[0]?.processed_at || null,
      recentErrors: recentErrors?.map((e) => ({ filename: e.filename, error: e.error_message })) || [],
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to get status" },
      { status: 500 },
    );
  }
}
