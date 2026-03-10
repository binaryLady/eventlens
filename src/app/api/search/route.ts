// @TheTechMargin 2026
import { NextRequest, NextResponse } from "next/server";
import { rowToPhoto } from "@/lib/photos";
import { PhotoRow } from "@/lib/supabase";

export const maxDuration = 15;

export async function GET(request: NextRequest) {
  const rawQuery = request.nextUrl.searchParams.get("q") || "";
  const query = rawQuery.slice(0, 200).replace(/<[^>]*>/g, "").trim();
  const folder = (request.nextUrl.searchParams.get("folder") || "").slice(0, 100).replace(/<[^>]*>/g, "").trim();

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
      return NextResponse.json({ results: [], source: "error" });
    }

    const results = (data as PhotoRow[] || [])
      .filter((row) => !folder || row.folder === folder)
      .map(rowToPhoto);

    return NextResponse.json({ results, source: "supabase" });
  } catch {
    return NextResponse.json({ results: [], source: "error" });
  }
}
