import { NextResponse } from "next/server";
import { config } from "@/lib/config";
import { fetchPhotosFromDriveFolder, fetchPhotos, getFolders } from "@/lib/photos";

export const revalidate = 30;

// @TheTechMargin 2026
export async function GET() {
  try {
    const photos = config.driveFolderId
      ? await fetchPhotosFromDriveFolder()
      : await fetchPhotos();

    const folders = getFolders(photos);

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
