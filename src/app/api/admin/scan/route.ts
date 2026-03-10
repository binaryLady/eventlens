import { NextRequest, NextResponse } from "next/server";
import { config } from "@/lib/config";
import { createServerClient } from "@/lib/supabase";

export const maxDuration = 60;

/**
 * POST /api/admin/scan
 * Discover images in Google Drive folder (recursively) and insert new ones
 * into Supabase as pending rows for indexing.
 *
 * Protected by ADMIN_API_SECRET bearer token.
 */
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

    // 1. List all subfolders
    const folders = await listDriveFolders(driveFolderId, googleApiKey);
    const allFolderIds = [
      { id: driveFolderId, name: "root" },
      ...folders,
    ];

    // 2. For each folder, list image files
    let discovered = 0;
    let inserted = 0;
    let alreadyKnown = 0;

    for (const folder of allFolderIds) {
      const files = await listDriveImages(folder.id, googleApiKey);

      for (const file of files) {
        discovered++;

        // Upsert — skip if drive_file_id already exists
        const { error } = await supabase.from("photos").upsert(
          {
            drive_file_id: file.id,
            filename: file.name,
            drive_url: `https://drive.google.com/file/d/${file.id}/view`,
            folder: folder.name === "root" ? "" : folder.name,
            mime_type: file.mimeType,
            status: "pending",
          },
          {
            onConflict: "drive_file_id",
            ignoreDuplicates: true, // Don't overwrite completed rows
          },
        );

        if (error) {
          // Unique constraint conflict means already known
          alreadyKnown++;
        } else {
          inserted++;
        }
      }
    }

    // Recount — upsert with ignoreDuplicates returns no error for skips
    alreadyKnown = discovered - inserted;

    return NextResponse.json({
      discovered,
      newFiles: inserted,
      alreadyKnown,
      folders: allFolderIds.length,
    });
  } catch (error) {
    console.error("Scan error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to scan Drive",
      },
      { status: 500 },
    );
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────

function verifyAuth(request: NextRequest): boolean {
  const { adminSecret } = config;
  if (!adminSecret) return false;

  const auth = request.headers.get("authorization");
  if (!auth) return false;

  const token = auth.replace(/^Bearer\s+/i, "");
  return token === adminSecret;
}

interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
}

async function listDriveFolders(
  parentId: string,
  apiKey: string,
): Promise<Array<{ id: string; name: string }>> {
  const folders: Array<{ id: string; name: string }> = [];
  let pageToken: string | undefined;

  do {
    const query = encodeURIComponent(
      `'${parentId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
    );
    let url = `https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id,name),nextPageToken&pageSize=200&key=${apiKey}`;
    if (pageToken) url += `&pageToken=${encodeURIComponent(pageToken)}`;

    const res = await fetch(url);
    if (!res.ok) break;

    const data: {
      files?: Array<{ id: string; name: string }>;
      nextPageToken?: string;
    } = await res.json();

    for (const f of data.files || []) {
      folders.push({ id: f.id, name: f.name });
    }

    pageToken = data.nextPageToken;
  } while (pageToken);

  return folders;
}

async function listDriveImages(
  folderId: string,
  apiKey: string,
): Promise<DriveFile[]> {
  const files: DriveFile[] = [];
  let pageToken: string | undefined;

  do {
    const query = encodeURIComponent(
      `'${folderId}' in parents and mimeType contains 'image/' and trashed = false`,
    );
    let url = `https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id,name,mimeType),nextPageToken&pageSize=1000&key=${apiKey}`;
    if (pageToken) url += `&pageToken=${encodeURIComponent(pageToken)}`;

    const res = await fetch(url);
    if (!res.ok) break;

    const data: {
      files?: DriveFile[];
      nextPageToken?: string;
    } = await res.json();

    files.push(...(data.files || []));
    pageToken = data.nextPageToken;
  } while (pageToken);

  return files;
}
