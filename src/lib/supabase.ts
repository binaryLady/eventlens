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
