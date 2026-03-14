// @TheTechMargin 2026
// Phase: DESCRIBE — Gemini vision analysis + text embeddings.
// Uses wall-clock guard to bail out before serverless timeout.

import { downloadAsBase64 } from "../drive-client";
import { GeminiClient } from "../gemini-client";
import { SupabaseStore } from "../supabase-store";
import type { PipelinePhoto, PhaseResult } from "../types";

const MAX_DURATION_MS = 250_000; // 250s — leave 50s buffer before 300s hard kill

/**
 * Build a combined text string for embedding from photo metadata.
 */
function buildEmbeddingText(photo: PipelinePhoto): string {
  return [
    photo.visible_text || "",
    photo.people_descriptions || "",
    photo.scene_description || "",
    photo.filename || "",
    photo.folder || "",
  ]
    .filter(Boolean)
    .join(" ")
    .trim();
}

/**
 * Generate and store description embeddings for a batch of photos.
 */
async function embedDescriptions(
  gemini: GeminiClient,
  store: SupabaseStore,
  photos: PipelinePhoto[],
): Promise<number> {
  const texts: string[] = [];
  const fileIds: string[] = [];

  for (const p of photos) {
    const combined = buildEmbeddingText(p);
    if (combined) {
      texts.push(combined);
      fileIds.push(p.drive_file_id);
    }
  }

  if (!texts.length) return 0;

  try {
    const embeddings = await gemini.embedTextsBatch(texts);
    let totalSaved = 0;

    for (let i = 0; i < fileIds.length; i += 100) {
      const batchUpdates = fileIds.slice(i, i + 100).map((fid, j) => ({
        driveFileId: fid,
        embedding: embeddings[i + j],
      }));
      totalSaved += await store.updateDescriptionEmbeddingsBatch(batchUpdates);
    }

    return totalSaved;
  } catch (err) {
    console.error(`[describe] Embedding batch failed: ${err}`);
    return 0;
  }
}

export async function phaseDescribe(
  apiKey: string,
  geminiApiKey: string,
  retryErrors = false,
): Promise<PhaseResult> {
  const store = new SupabaseStore();
  const gemini = new GeminiClient(geminiApiKey, 30);
  const errors: string[] = [];
  const startTime = Date.now();

  // Re-queue errored photos if requested
  if (retryErrors) {
    const errored = await store.getPhotosByStatus(["error"]);
    for (const p of errored) {
      await store.updatePhotoMetadata(p.drive_file_id, {
        status: "pending",
        error_message: null,
      });
    }
    if (errored.length) console.log(`[describe] Re-queued ${errored.length} errored photos`);
  }

  const photos = (await store.getPhotosByStatus(["pending", "error"])).filter(
    (p) => !p.mime_type?.startsWith("video/"),
  );

  if (!photos.length) {
    return { phase: "describe", processed: 0, remaining: 0, done: true, errors: [] };
  }

  let processed = 0;
  const batchDescribed: PipelinePhoto[] = [];
  const batchSize = 20; // Embed after every 20 photos

  for (const photo of photos) {
    // Wall-clock guard
    if (Date.now() - startTime > MAX_DURATION_MS) break;

    const fid = photo.drive_file_id;
    try {
      const img = await downloadAsBase64(fid, apiKey);
      if (!img) {
        await store.updatePhotoMetadata(fid, {
          status: "error",
          error_message: "Download failed",
        });
        errors.push(photo.filename);
        continue;
      }

      if (img.mimeType.startsWith("video/")) {
        await store.updatePhotoMetadata(fid, {
          status: "completed",
          error_message: "skipped: video",
        });
        processed++;
        continue;
      }

      const result = await gemini.analyzePhoto(img.base64, img.mimeType);
      const now = new Date().toISOString();

      await store.updatePhotoMetadata(fid, {
        ...result,
        status: "completed",
        error_message: null,
        processed_at: now,
      });

      batchDescribed.push({ ...photo, ...result });
      processed++;

      // Embed descriptions periodically
      if (batchDescribed.length >= batchSize) {
        await embedDescriptions(gemini, store, batchDescribed);
        batchDescribed.length = 0;
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[describe] Failed ${photo.filename}: ${msg}`);
      await store.updatePhotoMetadata(fid, {
        status: "error",
        error_message: msg.slice(0, 500),
      });
      errors.push(photo.filename);
    }
  }

  // Embed any remaining
  if (batchDescribed.length > 0) {
    await embedDescriptions(gemini, store, batchDescribed);
  }

  const remaining = photos.length - processed - errors.length;
  console.log(`[describe] ${processed} processed, ${remaining} remaining`);

  return {
    phase: "describe",
    processed,
    remaining: Math.max(0, remaining),
    done: remaining <= 0,
    errors,
  };
}
