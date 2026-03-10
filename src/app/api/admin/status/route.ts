import { NextRequest, NextResponse } from "next/server";
import { config } from "@/lib/config";
import { createServerClient } from "@/lib/supabase";

/**
 * GET /api/admin/status
 * Returns indexing progress: counts by status, recent errors.
 * Protected by ADMIN_API_SECRET bearer token.
 */
export async function GET(request: NextRequest) {
  if (!verifyAuth(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const supabase = createServerClient();

    // Get counts by status
    const [completed, pending, processing, errors, total] = await Promise.all([
      supabase
        .from("photos")
        .select("*", { count: "exact", head: true })
        .eq("status", "completed"),
      supabase
        .from("photos")
        .select("*", { count: "exact", head: true })
        .eq("status", "pending"),
      supabase
        .from("photos")
        .select("*", { count: "exact", head: true })
        .eq("status", "processing"),
      supabase
        .from("photos")
        .select("*", { count: "exact", head: true })
        .eq("status", "error"),
      supabase.from("photos").select("*", { count: "exact", head: true }),
    ]);

    // Get most recently processed
    const { data: lastProcessed } = await supabase
      .from("photos")
      .select("processed_at")
      .eq("status", "completed")
      .order("processed_at", { ascending: false })
      .limit(1);

    // Get recent errors
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
      lastProcessed: lastProcessed?.[0]?.processed_at || null,
      recentErrors:
        recentErrors?.map((e) => ({
          filename: e.filename,
          error: e.error_message,
        })) || [],
    });
  } catch (error) {
    console.error("Status error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to get status" },
      { status: 500 },
    );
  }
}

function verifyAuth(request: NextRequest): boolean {
  const { adminSecret } = config;
  if (!adminSecret) return false;

  const auth = request.headers.get("authorization");
  if (!auth) return false;

  const token = auth.replace(/^Bearer\s+/i, "");
  return token === adminSecret;
}
