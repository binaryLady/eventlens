// EventLens — @TheTechMargin 2026
import { createClient, SupabaseClient } from "@supabase/supabase-js";

/**
 * Server-side Supabase client with service role key.
 * Has full read/write access — use only in API routes.
 */
export function createServerClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error(
      "Missing Supabase server config (NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY)",
    );
  }

  return createClient(url, key, {
    auth: { persistSession: false },
  });
}

/**
 * Read-only Supabase client with anon key.
 * Safe for fetching public data (photos table has SELECT policy for all).
 */
export function createAnonClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY;

  if (!url || !key) {
    throw new Error(
      "Missing Supabase config (NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY)",
    );
  }

  return createClient(url, key, {
    auth: { persistSession: false },
  });
}

/** Face match result from vector similarity search */
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

/**
 * Search face_embeddings by vector similarity using the match_faces RPC.
 * query_embedding must be a 512-dim InsightFace (buffalo_l) embedding.
 */
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

  if (error) {
    console.error("Vector match error:", error.message);
    return [];
  }

  return (data as FaceMatch[]) || [];
}

/** Row shape in the `photos` table */
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
