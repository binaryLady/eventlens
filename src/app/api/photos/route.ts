// @TheTechMargin 2026
import { NextResponse } from "next/server";
import { fetchPhotosWithMetadata, getFolders, getTags } from "@/lib/photos";

export const revalidate = 30;

export async function GET() {
  try {
    const photos = await fetchPhotosWithMetadata();

    const folders = getFolders(photos);
    const tags = getTags(photos);

    const lastUpdated =
      photos.length > 0
        ? photos.reduce((latest, p) => {
            const t = p.processedAt;
            return t > latest ? t : latest;
          }, photos[0].processedAt)
        : "";

    return NextResponse.json({ photos, folders, tags, lastUpdated });
  } catch {
    return NextResponse.json(
      { error: "Failed to fetch photos" },
      { status: 500 }
    );
  }
}
