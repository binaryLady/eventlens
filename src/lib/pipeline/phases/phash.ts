// @TheTechMargin 2026
// Phase: PHASH — Compute perceptual hashes for duplicate detection.

import { downloadAsBase64 } from "../drive-client";
import { computeDhashFromBase64 } from "../phash";
import { SupabaseStore } from "../supabase-store";
import type { PhaseResult } from "../types";

const MAX_DURATION_MS = 250_000;

export async function phasePhash(apiKey: string): Promise<PhaseResult> {
  const store = new SupabaseStore();
  const errors: string[] = [];
  const startTime = Date.now();

  const photos = (await store.getPhotosMissingPhash()).filter(
    (p) => !p.mime_type?.startsWith("video/"),
  );

  if (!photos.length) {
    return { phase: "phash", processed: 0, remaining: 0, done: true, errors: [] };
  }

  let processed = 0;

  for (const photo of photos) {
    if (Date.now() - startTime > MAX_DURATION_MS) break;

    const fid = photo.drive_file_id;
    try {
      // Download small thumbnail — dHash only needs low-res
      const img = await downloadAsBase64(fid, apiKey, 64);
      if (!img) {
        errors.push(photo.filename);
        continue;
      }

      if (img.mimeType.startsWith("video/")) continue;

      const hashValue = await computeDhashFromBase64(img.base64);
      await store.updatePhash(fid, hashValue);
      processed++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[phash] Failed ${photo.filename}: ${msg}`);
      errors.push(photo.filename);
    }
  }

  const remaining = photos.length - processed - errors.length;
  console.log(`[phash] ${processed} hashed, ${remaining} remaining`);

  return {
    phase: "phash",
    processed,
    remaining: Math.max(0, remaining),
    done: remaining <= 0,
    errors,
  };
}
