// @TheTechMargin 2026
// Phase: EMBED — Backfill description embeddings for completed photos.

import { GeminiClient } from "../gemini-client";
import { SupabaseStore } from "../supabase-store";
import type { PipelinePhoto, PhaseResult } from "../types";

const MAX_DURATION_MS = 250_000;

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

export async function phaseEmbed(geminiApiKey: string): Promise<PhaseResult> {
  const store = new SupabaseStore();
  const gemini = new GeminiClient(geminiApiKey, 30);
  const errors: string[] = [];
  const startTime = Date.now();

  const photos = await store.getPhotosMissingEmbedding();
  if (!photos.length) {
    return { phase: "embed", processed: 0, remaining: 0, done: true, errors: [] };
  }

  let totalSaved = 0;

  // Process in chunks of 100 (Gemini batch limit)
  for (let i = 0; i < photos.length; i += 100) {
    if (Date.now() - startTime > MAX_DURATION_MS) break;

    const chunk = photos.slice(i, i + 100);
    const texts: string[] = [];
    const fileIds: string[] = [];

    for (const p of chunk) {
      const combined = buildEmbeddingText(p);
      if (combined) {
        texts.push(combined);
        fileIds.push(p.drive_file_id);
      }
    }

    if (!texts.length) continue;

    try {
      const embeddings = await gemini.embedTextsBatch(texts);
      const updates = fileIds.map((fid, j) => ({
        driveFileId: fid,
        embedding: embeddings[j],
      }));
      totalSaved += await store.updateDescriptionEmbeddingsBatch(updates);
    } catch (err) {
      errors.push(`Batch at offset ${i}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  const remaining = photos.length - totalSaved;
  console.log(`[embed] Stored ${totalSaved} embeddings, ${remaining} remaining`);

  return {
    phase: "embed",
    processed: totalSaved,
    remaining: Math.max(0, remaining),
    done: remaining <= 0,
    errors,
  };
}
