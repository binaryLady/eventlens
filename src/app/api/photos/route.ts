// @TheTechMargin 2026
import { NextRequest, NextResponse } from "next/server";
import { fetchPhotosWithMetadata, getFolders, getTags } from "@/lib/photos";

export const revalidate = 30;

export async function GET(request: NextRequest) {
  console.log("[v0] /api/photos GET request received");
  console.log("[v0] ENV CHECK - GOOGLE_CLIENT_EMAIL:", process.env.GOOGLE_CLIENT_EMAIL ? `SET (${process.env.GOOGLE_CLIENT_EMAIL.length} chars)` : "MISSING");
  console.log("[v0] ENV CHECK - GOOGLE_PRIVATE_KEY:", process.env.GOOGLE_PRIVATE_KEY ? `SET (${process.env.GOOGLE_PRIVATE_KEY.length} chars)` : "MISSING");
  console.log("[v0] ENV CHECK - GOOGLE_API_KEY:", process.env.GOOGLE_API_KEY ? `SET (${process.env.GOOGLE_API_KEY.length} chars)` : "MISSING");
  console.log("[v0] ENV CHECK - GOOGLE_DRIVE_FOLDER_ID:", process.env.GOOGLE_DRIVE_FOLDER_ID || "MISSING");
  try {
    const { searchParams } = new URL(request.url);
    const limit = Number(searchParams.get("limit")) || 0;
    const offset = Number(searchParams.get("offset")) || 0;

    console.log("[v0] Calling fetchPhotosWithMetadata...");
    const allPhotos = await fetchPhotosWithMetadata();
    console.log("[v0] fetchPhotosWithMetadata returned", allPhotos.length, "photos");
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

    console.log("[v0] /api/photos responding with", photos.length, "photos,", folders.length, "folders,", tags.length, "tags");
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
