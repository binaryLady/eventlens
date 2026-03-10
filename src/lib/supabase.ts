// @TheTechMargin 2026
import { createClient, SupabaseClient } from "@supabase/supabase-js";

export function createServerClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  }
  return createClient(url, key, { auth: { persistSession: false } });
}

export function createAnonClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY;
  if (!url || !key) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY");
  }
  return createClient(url, key, { auth: { persistSession: false } });
}

export interface FaceMatch {
  drive_file_id: string;
  filename: string;
  folder: string;
  face_index: number;
  similarity: number;
  bbox_x1: number;
  bbox_y1: number;
  bbox_x2: number;
  bbox_y2: number;
}

export async function matchFacesByEmbedding(
  queryEmbedding: number[],
  threshold = 0.6,
  limit = 20,
): Promise<FaceMatch[]> {
  const supabase = createServerClient();
  const { data, error } = await supabase.rpc("match_faces", {
    query_embedding: queryEmbedding,
    match_threshold: threshold,
    match_count: limit,
  });
  if (error) return [];
  return (data as FaceMatch[]) || [];
}

/**
 * Append appearance attributes to a photo's people_descriptions.
 * Deduplicates against existing terms. No PII — only physical attributes.
 */
export async function enrichPhotoDescriptions(
  driveFileId: string,
  newTerms: string,
): Promise<void> {
  if (!newTerms.trim()) return;
  try {
    const supabase = createServerClient();
    const { data } = await supabase
      .from("photos")
      .select("people_descriptions")
      .eq("drive_file_id", driveFileId)
      .single();

    const existing = (data?.people_descriptions as string) || "";
    const existingLower = existing.toLowerCase();

    // Only append terms not already present
    const additions = newTerms
      .split(/[,;]+/)
      .map((t) => t.trim())
      .filter((t) => t.length > 2 && !existingLower.includes(t.toLowerCase()));

    if (additions.length === 0) return;

    const merged = existing
      ? `${existing}; ${additions.join("; ")}`
      : additions.join("; ");

    await supabase
      .from("photos")
      .update({ people_descriptions: merged })
      .eq("drive_file_id", driveFileId);
  } catch {
    // Non-critical — don't break match flow
  }
}

export interface SemanticMatch {
  id: string;
  drive_file_id: string;
  filename: string;
  drive_url: string;
  folder: string;
  visible_text: string;
  people_descriptions: string;
  scene_description: string;
  face_count: number;
  similarity: number;
}

export async function searchPhotosSemantic(
  queryEmbedding: number[],
  threshold = 0.35,
  limit = 30,
): Promise<SemanticMatch[]> {
  const supabase = createServerClient();
  const { data, error } = await supabase.rpc("search_photos_semantic", {
    query_embedding: queryEmbedding,
    match_threshold: threshold,
    match_count: limit,
  });
  if (error) return [];
  return (data as SemanticMatch[]) || [];
}

/**
 * Save a match session for analytics. Fire-and-forget — never blocks the response.
 */
export async function saveMatchSession(params: {
  tier: string;
  matchCount: number;
  topConfidence: number | null;
  queryEmbedding: number[] | null;
  matchedPhotoIds: string[];
}): Promise<void> {
  try {
    const supabase = createServerClient();
    await supabase.from("match_sessions").insert({
      tier: params.tier,
      match_count: params.matchCount,
      top_confidence: params.topConfidence,
      query_embedding: params.queryEmbedding,
      matched_photo_ids: params.matchedPhotoIds,
    });
  } catch {
    // Non-critical — don't break match flow
  }
}

export interface PhotoRow {
  id: string;
  drive_file_id: string;
  filename: string;
  drive_url: string;
  folder: string;
  visible_text: string;
  people_descriptions: string;
  scene_description: string;
  face_count: number;
  mime_type: string | null;
  processed_at: string;
  created_at: string;
  status: "pending" | "processing" | "completed" | "error";
  error_message: string | null;
}
