// @TheTechMargin 2026
// Phase: SCAN — Discover new images in Drive that aren't yet in Supabase.

import { listDriveImages, listDriveSubfolders } from "../drive-client";
import { SupabaseStore } from "../supabase-store";
import type { PhaseResult } from "../types";

export async function phaseScan(
  apiKey: string,
  driveFolderId: string,
): Promise<PhaseResult> {
  const store = new SupabaseStore();
  const errors: string[] = [];

  const subfolders = await listDriveSubfolders(driveFolderId, apiKey);
  const allFolders = [{ id: driveFolderId, name: "root" }, ...subfolders];

  let discovered = 0;

  for (const folder of allFolders) {
    try {
      const files = await listDriveImages(folder.id, apiKey);
      for (const f of files) {
        await store.upsertPhoto({
          drive_file_id: f.id,
          filename: f.name,
          drive_url: `https://drive.google.com/file/d/${f.id}/view`,
          folder: folder.name === "root" ? "" : folder.name,
          mime_type: f.mimeType || "",
          status: "pending",
        });
        discovered++;
      }
    } catch (err) {
      errors.push(`Folder ${folder.name}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  console.log(`[scan] ${discovered} photos discovered`);
  return { phase: "scan", processed: discovered, remaining: 0, done: true, errors };
}
