import { NextRequest, NextResponse } from "next/server";
import { config } from "@/lib/config";
import { createServerClient } from "@/lib/supabase";
import { extractDriveFileId, fetchPhotosFromSheet } from "@/lib/photos";

export const maxDuration = 60;

/**
 * POST /api/admin/migrate
 * One-time migration: copy existing Google Sheet photo data into Supabase.
 * Rows are upserted by drive_file_id — safe to run multiple times.
 *
 * Protected by ADMIN_API_SECRET bearer token.
 */
export async function POST(request: NextRequest) {
  if (!verifyAuth(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const supabase = createServerClient();

    // Fetch all photos from the Google Sheet (existing data source)
    const sheetPhotos = await fetchPhotosFromSheet();

    if (sheetPhotos.length === 0) {
      return NextResponse.json({
        message: "No photos found in Google Sheet",
        migrated: 0,
      });
    }

    let migrated = 0;
    let skipped = 0;
    const errors: Array<{ filename: string; error: string }> = [];

    // Process in chunks of 50 to avoid hitting Supabase limits
    const chunkSize = 50;
    for (let i = 0; i < sheetPhotos.length; i += chunkSize) {
      const chunk = sheetPhotos.slice(i, i + chunkSize);

      const rows = chunk
        .map((photo) => {
          const driveFileId =
            photo.driveFileId || extractDriveFileId(photo.driveUrl);
          if (!driveFileId) return null;

          return {
            drive_file_id: driveFileId,
            filename: photo.filename,
            drive_url: photo.driveUrl,
            folder: photo.folder || "",
            visible_text: photo.visibleText || "",
            people_descriptions: photo.peopleDescriptions || "",
            scene_description: photo.sceneDescription || "",
            face_count: photo.faceCount || 0,
            processed_at: photo.processedAt || new Date().toISOString(),
            status: "completed" as const,
          };
        })
        .filter((r): r is NonNullable<typeof r> => r !== null);

      if (rows.length === 0) {
        skipped += chunk.length;
        continue;
      }

      const { error } = await supabase
        .from("photos")
        .upsert(rows, { onConflict: "drive_file_id" });

      if (error) {
        errors.push({
          filename: `chunk ${i}-${i + chunk.length}`,
          error: error.message,
        });
      } else {
        migrated += rows.length;
        skipped += chunk.length - rows.length;
      }
    }

    return NextResponse.json({
      migrated,
      skipped,
      errors,
      total: sheetPhotos.length,
    });
  } catch (error) {
    console.error("Migration error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to migrate data",
      },
      { status: 500 },
    );
  }
}

function verifyAuth(request: NextRequest): boolean {
  const { adminSecret } = config;
  if (!adminSecret) return false;

  const auth = request.headers.get("authorization");
  if (!auth) return false;

  const token = auth.replace(/^Bearer\s+/i, "");
  return token === adminSecret;
}
