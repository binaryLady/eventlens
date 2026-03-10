// @TheTechMargin 2026
import { NextRequest, NextResponse } from "next/server";
import { rowToPhoto } from "@/lib/photos";
import { PhotoRow, searchPhotosSemantic } from "@/lib/supabase";

export const maxDuration = 15;

const GEMINI_EMBED_URL =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent";

async function embedQuery(text: string): Promise<number[] | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;

  try {
    const res = await fetch(`${GEMINI_EMBED_URL}?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "models/gemini-embedding-001",
        content: { parts: [{ text }] },
        outputDimensionality: 768,
      }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.embedding?.values ?? null;
  } catch {
    return null;
  }
}

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
    const [semanticResults, textResults] = await Promise.all([
      embedQuery(query).then((embedding) =>
        embedding ? searchPhotosSemantic(embedding, 0.35, 30) : []
      ),
      (async () => {
        const { createServerClient } = await import("@/lib/supabase");
        const supabase = createServerClient();
        const { data } = await supabase.rpc("search_photos", {
          query_text: query,
          result_limit: 60,
        });
        return (data as PhotoRow[]) || [];
      })(),
    ]);

    const byId = new Map<string, { photo: ReturnType<typeof rowToPhoto>; score: number }>();

    for (const row of textResults) {
      const photo = rowToPhoto(row);
      if (folder && photo.folder !== folder) continue;
      byId.set(photo.id, { photo, score: (row as PhotoRow & { rank?: number }).rank ?? 1 });
    }

    for (const match of semanticResults) {
      if (folder && match.folder !== folder) continue;
      const existing = byId.get(match.id);
      const semanticScore = match.similarity * 20;
      if (existing) {
        existing.score += semanticScore;
      } else {
        byId.set(match.id, {
          photo: rowToPhoto({
            id: match.id,
            drive_file_id: match.drive_file_id,
            filename: match.filename,
            drive_url: match.drive_url,
            folder: match.folder,
            visible_text: match.visible_text,
            people_descriptions: match.people_descriptions,
            scene_description: match.scene_description,
            face_count: match.face_count,
            mime_type: null,
            processed_at: "",
            created_at: "",
            status: "completed",
            error_message: null,
          }),
          score: semanticScore,
        });
      }
    }

    const results = Array.from(byId.values())
      .sort((a, b) => b.score - a.score)
      .map((r) => r.photo);

    return NextResponse.json({
      results,
      source: semanticResults.length > 0 ? "semantic+text" : "supabase",
    });
  } catch {
    return NextResponse.json({ results: [], source: "error" });
  }
}
