import { NextResponse } from "next/server";
import { fetchPhotos, getFolders, fetchDriveFolders } from "@/lib/photos";

export const revalidate = 30;

export async function GET() {
  try {
    const [photos, driveFolders] = await Promise.all([
      fetchPhotos(),
      fetchDriveFolders(),
    ]);

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
  } catch (error) {
    console.error("Error fetching photos:", error);
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
