// @TheTechMargin 2026
import { NextRequest, NextResponse } from "next/server";
import { fetchPhotosWithMetadata, getFolders, getTags } from "@/lib/photos";

export const revalidate = 30;

export async function GET(request: NextRequest) {
  console.log("[v0] GATE 1: /api/photos request received");
  console.log("[v0] GATE 2: ENV - email:", !!process.env.GOOGLE_CLIENT_EMAIL, "key:", !!process.env.GOOGLE_PRIVATE_KEY, "apiKey:", !!process.env.GOOGLE_API_KEY, "folder:", !!process.env.GOOGLE_DRIVE_FOLDER_ID);
  try {
    const { searchParams } = new URL(request.url);
    const limit = Number(searchParams.get("limit")) || 0;
    const offset = Number(searchParams.get("offset")) || 0;

    console.log("[v0] GATE 3: calling fetchPhotosWithMetadata");
    const allPhotos = await fetchPhotosWithMetadata();
    console.log("[v0] GATE 4: got", allPhotos.length, "photos");
    const folders = getFolders(allPhotos);
    const tags = getTags(allPhotos);
    const total = allPhotos.length;

    // If limit is specified, return a slice; otherwise return all photos.
    // ISR cache (revalidate: 30) means the full fetch only runs every 30s.
    // Progressive DOM rendering via IntersectionObserver handles the frontend perf.
    const photos = limit > 0 ? allPhotos.slice(offset, offset + limit) : allPhotos;

    const lastUpdated =
      allPhotos.length > 0
        ? allPhotos.reduce((latest, p) => {
            const t = p.processedAt;
            return t > latest ? t : latest;
          }, allPhotos[0].processedAt)
        : "";

    console.log("[v0] GATE 5: responding with", photos.length, "photos");
    return NextResponse.json({
      photos,
      folders,
      tags,
      lastUpdated,
      total,
      hasMore: limit > 0 ? offset + limit < total : false,
    });
  } catch (error) {
    console.error("[v0] /api/photos ERROR:", error);
    return NextResponse.json(
      { error: "Failed to fetch photos" },
      { status: 500 }
    );
  }
}
