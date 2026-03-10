import { NextRequest, NextResponse } from "next/server";
import { PhotoRecord } from "@/lib/types";

export const maxDuration = 15;

/**
 * GET /api/search?q=<query>&folder=<folder>
 * Server-side semantic search using Supabase full-text + trigram indexes.
 * Falls back to client-side matching if Supabase is unavailable.
 */
// @TheTechMargin 2026
export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get("q") || "";
  const folder = request.nextUrl.searchParams.get("folder") || "";

  if (!query && !folder) {
    return NextResponse.json({ results: [], source: "none" });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseKey || !query) {
    return NextResponse.json({ results: [], source: "unavailable" });
  }

  try {
    const { createServerClient } = await import("@/lib/supabase");
    const supabase = createServerClient();

    const { data, error } = await supabase.rpc("search_photos", {
      query_text: query,
      result_limit: 60,
    });

    if (error) {
      console.error("Search RPC error:", error.message);
      return NextResponse.json({ results: [], source: "error" });
    }

    const results: PhotoRecord[] = (data || [])
      .filter((row: { drive_file_id: string; folder?: string }) => {
        if (folder && row.folder !== folder) return false;
        return true;
      })
      .map(
        (row: {
          id: string;
          drive_file_id: string;
          filename: string;
          drive_url: string;
          folder: string;
          visible_text: string;
          people_descriptions: string;
          scene_description: string;
          face_count: number;
          processed_at: string;
          created_at: string;
        }) => ({
          id: row.id,
          filename: row.filename,
          driveUrl: row.drive_url,
          driveFileId: row.drive_file_id,
          folder: row.folder || "",
          visibleText: row.visible_text || "",
          peopleDescriptions: row.people_descriptions || "",
          sceneDescription: row.scene_description || "",
          faceCount: row.face_count || 0,
          processedAt: row.processed_at || row.created_at || "",
          thumbnailUrl: row.drive_file_id
            ? `https://lh3.googleusercontent.com/d/${row.drive_file_id}=w400`
            : "",
          downloadUrl: row.drive_file_id
            ? `https://drive.google.com/uc?export=download&id=${row.drive_file_id}`
            : "",
        }),
      );

    return NextResponse.json({ results, source: "supabase" });
  } catch (err) {
    console.error("Search error:", err);
    return NextResponse.json({ results: [], source: "error" });
  }
}
