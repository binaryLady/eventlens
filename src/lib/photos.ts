import { PhotoRecord } from "./types";
import { config } from "./config";
import { createAnonClient, PhotoRow } from "./supabase";

export function extractDriveFileId(driveUrl: string): string {
  const fileMatch = driveUrl.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
  if (fileMatch) return fileMatch[1];

  const openMatch = driveUrl.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (openMatch) return openMatch[1];

  return "";
}

/**
 * Fetch completed photo records from Supabase.
 */
export async function fetchPhotos(): Promise<PhotoRecord[]> {
  try {
    const supabase = createAnonClient();

    const { data, error } = await supabase
      .from("photos")
      .select("*")
      .eq("status", "completed")
      .order("processed_at", { ascending: false });

    if (error) {
      console.error("Supabase fetch error:", error);
      return [];
    }

    return (data || []).map((row: PhotoRow) => ({
      id: row.id,
      filename: row.filename,
      driveUrl: row.drive_url,
      driveFileId: row.drive_file_id,
      folder: row.folder,
      visibleText: row.visible_text,
      peopleDescriptions: row.people_descriptions,
      sceneDescription: row.scene_description,
      faceCount: row.face_count,
      processedAt: row.processed_at,
      thumbnailUrl: row.drive_file_id
        ? `https://lh3.googleusercontent.com/d/${row.drive_file_id}=w400`
        : "",
      downloadUrl: row.drive_file_id
        ? `https://drive.google.com/uc?export=download&id=${row.drive_file_id}`
        : "",
    }));
  } catch (error) {
    console.error("Supabase fetch failed:", error);
    return [];
  }
}

/** Client-side text search — runs in the browser, no server round-trip */
export function searchPhotos(
  query: string,
  photos: PhotoRecord[],
): PhotoRecord[] {
  const terms = query
    .toLowerCase()
    .split(/\s+/)
    .filter((t) => t.length > 0);

  if (terms.length === 0) return photos;

  const scored = photos
    .map((photo) => {
      const fields = {
        visibleText: photo.visibleText.toLowerCase(),
        filename: photo.filename.toLowerCase(),
        folder: photo.folder.toLowerCase(),
        peopleDescriptions: photo.peopleDescriptions.toLowerCase(),
        sceneDescription: photo.sceneDescription.toLowerCase(),
      };

      let score = 0;
      let allTermsMatch = true;

      for (const term of terms) {
        let termMatch = false;

        if (fields.visibleText.includes(term)) {
          score += 10;
          termMatch = true;
        }
        if (fields.filename.includes(term)) {
          score += 5;
          termMatch = true;
        }
        if (fields.folder.includes(term)) {
          score += 5;
          termMatch = true;
        }
        if (fields.peopleDescriptions.includes(term)) {
          score += 3;
          termMatch = true;
        }
        if (fields.sceneDescription.includes(term)) {
          score += 2;
          termMatch = true;
        }

        if (!termMatch) {
          allTermsMatch = false;
          break;
        }
      }

      return { photo, score, allTermsMatch };
    })
    .filter((item) => item.allTermsMatch && item.score > 0);

  scored.sort((a, b) => b.score - a.score);

  return scored.map((item) => item.photo);
}

export function getFolders(photos: PhotoRecord[]): string[] {
  const folders = new Set<string>();
  for (const photo of photos) {
    if (photo.folder) {
      folders.add(photo.folder);
    }
  }
  return Array.from(folders).sort();
}

/**
 * Fetch all subfolder names from the Google Drive parent folder.
 */
export async function fetchDriveFolders(): Promise<string[]> {
  const { driveFolderId, googleApiKey } = config;

  if (!driveFolderId || !googleApiKey) {
    return [];
  }

  try {
    const query = encodeURIComponent(
      `'${driveFolderId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
    );
    const url = `https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(name)&orderBy=name&pageSize=200&key=${googleApiKey}`;

    const res = await fetch(url, { next: { revalidate: 300 } });
    if (!res.ok) {
      console.error(
        `Drive folders fetch error: ${res.status} ${res.statusText}`,
      );
      return [];
    }

    const data: { files?: Array<{ name: string }> } = await res.json();
    return (data.files || []).map((f) => f.name).sort();
  } catch (error) {
    console.error("Failed to fetch Drive folders:", error);
    return [];
  }
}
