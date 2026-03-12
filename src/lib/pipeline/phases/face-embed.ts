// @TheTechMargin 2026
// Phase: FACE-EMBED — Generate InsightFace embeddings for photos.

import { downloadAsBase64 } from "../drive-client";
import { FaceApiClient } from "../face-api-client";
import { SupabaseStore } from "../supabase-store";
import type { FaceEmbeddingRow, PhaseResult } from "../types";

const MAX_DURATION_MS = 250_000;

function faceSentinel(photo: {
  drive_file_id: string;
  filename: string;
  folder: string;
}): FaceEmbeddingRow {
  return {
    drive_file_id: photo.drive_file_id,
    filename: photo.filename,
    folder: photo.folder,
    face_index: -1,
    embedding: null,
    bbox_x1: 0,
    bbox_y1: 0,
    bbox_x2: 0,
    bbox_y2: 0,
  };
}

export async function phaseFaceEmbed(
  apiKey: string,
  faceApiUrl: string,
  faceApiSecret: string,
): Promise<PhaseResult> {
  const store = new SupabaseStore();
  const faceApi = new FaceApiClient(faceApiUrl, faceApiSecret);
  const errors: string[] = [];
  const startTime = Date.now();

  // Health check — return early if not ready
  const ready = await faceApi.healthCheck();
  if (!ready) {
    return {
      phase: "face-embed",
      processed: 0,
      remaining: -1,
      done: false,
      errors: [`Face API at ${faceApiUrl} is not reachable`],
    };
  }

  const allPhotos = (await store.getPhotosByStatus(["pending", "completed"])).filter(
    (p) => !p.mime_type?.startsWith("video/"),
  );
  const alreadyDone = await store.getExistingFaceFileIds();
  const todo = allPhotos.filter((p) => !alreadyDone.has(p.drive_file_id));

  if (!todo.length) {
    return { phase: "face-embed", processed: 0, remaining: 0, done: true, errors: [] };
  }

  let processed = 0;

  for (const photo of todo) {
    if (Date.now() - startTime > MAX_DURATION_MS) break;

    const fid = photo.drive_file_id;
    try {
      const img = await downloadAsBase64(fid, apiKey);
      if (!img) {
        errors.push(photo.filename);
        continue;
      }

      if (img.mimeType.startsWith("video/")) {
        await store.upsertFaceEmbedding(faceSentinel(photo));
        continue;
      }

      const faces = await faceApi.getEmbeddings(img.base64);

      if (!faces.length) {
        await store.upsertFaceEmbedding(faceSentinel(photo));
      }

      for (const face of faces) {
        const bb = (face.bbox || [0, 0, 0, 0]).slice(0, 4);
        while (bb.length < 4) bb.push(0);

        await store.upsertFaceEmbedding({
          drive_file_id: fid,
          filename: photo.filename,
          folder: photo.folder,
          face_index: face.index,
          embedding: face.embedding,
          bbox_x1: bb[0],
          bbox_y1: bb[1],
          bbox_x2: bb[2],
          bbox_y2: bb[3],
        });
      }

      processed++;

      // Small delay to not overwhelm the face API
      await new Promise((resolve) => setTimeout(resolve, 300));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[face-embed] Failed ${photo.filename}: ${msg}`);
      errors.push(photo.filename);
    }
  }

  const remaining = todo.length - processed - errors.length;
  console.log(`[face-embed] ${processed} processed, ${remaining} remaining`);

  return {
    phase: "face-embed",
    processed,
    remaining: Math.max(0, remaining),
    done: remaining <= 0,
    errors,
  };
}
