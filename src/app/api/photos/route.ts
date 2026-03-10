import { NextResponse } from "next/server";
import { config } from "@/lib/config";
import { fetchPhotosFromDriveFolder, fetchPhotos, getFolders, fetchDriveFolders } from "@/lib/photos";

export const revalidate = 30;

// @TheTechMargin 2026
export async function GET() {
  try {
    // Use Drive folder if configured, otherwise fall back to Google Sheet
    const photos = config.driveFolderId
      ? await fetchPhotosFromDriveFolder()
      : await fetchPhotos();

    const [driveFolders] = await Promise.all([fetchDriveFolders()]);

    // Use Drive folders when available, fall back to photo-derived folders
    const indexedFolders = getFolders(photos);
    const folders =
      driveFolders.length > 0
        ? mergeUnique(driveFolders, indexedFolders)
        : indexedFolders;

    const lastUpdated =
      photos.length > 0
        ? photos.reduce((latest, p) => {
            const t = p.processedAt;
            return t > latest ? t : latest;
          }, photos[0].processedAt)
        : "";

    return NextResponse.json({ photos, folders, lastUpdated });
  } catch {
    return NextResponse.json(
      { error: "Failed to fetch photos" },
      { status: 500 }
    );
  }
}

/** Merge two sorted string arrays, deduplicating by value */
function mergeUnique(a: string[], b: string[]): string[] {
  const set = new Set([...a, ...b]);
  return Array.from(set).sort();
}
