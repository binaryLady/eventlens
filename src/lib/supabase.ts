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
