// @TheTechMargin 2026
import { NextRequest, NextResponse } from "next/server";
import { config } from "@/lib/config";
import { verifyAuth } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase";
import { listDriveSubfolders, listDriveImages } from "@/lib/drive";

export const maxDuration = 60;

export async function POST(request: NextRequest) {
  if (!verifyAuth(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { driveFolderId, googleApiKey } = config;
  if (!driveFolderId || !googleApiKey) {
    return NextResponse.json(
      { error: "Missing GOOGLE_DRIVE_FOLDER_ID or GOOGLE_API_KEY" },
      { status: 500 },
    );
  }

  try {
    const supabase = createServerClient();

    const subfolders = await listDriveSubfolders(driveFolderId, googleApiKey);
    const allFolderIds = [{ id: driveFolderId, name: "root" }, ...subfolders];

    let discovered = 0;
    let inserted = 0;

    for (const folder of allFolderIds) {
      const files = await listDriveImages(folder.id, googleApiKey);

      for (const file of files) {
        discovered++;
        const { error } = await supabase.from("photos").upsert(
          {
            drive_file_id: file.id,
            filename: file.name,
            drive_url: `https://drive.google.com/file/d/${file.id}/view`,
            folder: folder.name === "root" ? "" : folder.name,
            mime_type: file.mimeType,
            status: "pending",
          },
          { onConflict: "drive_file_id", ignoreDuplicates: true },
        );
        if (!error) inserted++;
      }
    }

    return NextResponse.json({
      discovered,
      newFiles: inserted,
      alreadyKnown: discovered - inserted,
      folders: allFolderIds.length,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to scan Drive" },
      { status: 500 },
    );
  }
}
