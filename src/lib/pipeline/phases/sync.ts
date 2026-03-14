// @TheTechMargin 2026
// Phase: SYNC — Reconcile Google Drive state with Supabase.
// Detects renames, moves, and deletions.

import { listDriveImages, listDriveSubfolders } from "../drive-client";
import { SupabaseStore } from "../supabase-store";
import type { DriveEntry, PhaseResult } from "../types";

export async function phaseSync(
  apiKey: string,
  driveFolderId: string,
): Promise<PhaseResult> {
  const store = new SupabaseStore();
  const errors: string[] = [];

  // Fetch Drive folder structure
  const subfolders = await listDriveSubfolders(driveFolderId, apiKey);
  const allFolders = [{ id: driveFolderId, name: "" }, ...subfolders];

  // Build Drive maps
  const driveById = new Map<string, DriveEntry>();
  const driveByName = new Map<string, DriveEntry>();

  for (const folder of allFolders) {
    const files = await listDriveImages(folder.id, apiKey);
    for (const f of files) {
      const entry: DriveEntry = { id: f.id, name: f.name, folder: folder.name };
      driveById.set(f.id, entry);
      driveByName.set(f.name, entry);
    }
  }

  // Fetch all tracked photos
  const allPhotos = await store.getAllPhotos();
  if (!allPhotos.length) {
    return { phase: "sync", processed: 0, remaining: 0, done: true, errors: [] };
  }

  let updated = 0;
  let reconnected = 0;
  let orphaned = 0;

  for (const photo of allPhotos) {
    try {
      const fid = photo.drive_file_id;
      const sname = photo.filename || "";
      const sfolder = photo.folder || "";
      const entry = driveById.get(fid);

      if (entry) {
        // File still exists in Drive — check for renames/moves
        const changes: Record<string, string> = {};
        if (entry.name !== sname) changes.filename = entry.name;
        if (entry.folder !== sfolder) changes.folder = entry.folder;

        if (Object.keys(changes).length > 0) {
          await store.updatePhotoMetadata(fid, changes);
          await store.nullDescriptionEmbedding(fid);
          await store.updateFaceEmbeddingMetadata(fid, changes);
          updated++;
        }
      } else {
        // Not found by ID — try to reconnect by filename
        const match = driveByName.get(sname);
        if (match && match.id !== fid) {
          await store.reconnectPhoto(fid, match.id, sname, match.folder);
          reconnected++;
        } else {
          await store.deletePhoto(fid);
          orphaned++;
        }
      }
    } catch (err) {
      errors.push(`${photo.filename}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  const processed = updated + reconnected + orphaned;
  console.log(`[sync] ${updated} updated, ${reconnected} reconnected, ${orphaned} orphaned`);

  return { phase: "sync", processed, remaining: 0, done: true, errors };
}
