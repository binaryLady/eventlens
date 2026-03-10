// @TheTechMargin 2026
import { PhotoRecord } from "./types";
import { config } from "./config";
import { PhotoRow } from "./supabase";
import { DriveFile, listDriveImages, listDriveSubfolders } from "./drive";

function supabaseAvailable(): boolean {
  return !!(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

export function rowToPhoto(row: PhotoRow): PhotoRecord {
  return {
    id: row.id,
    filename: row.filename,
    driveUrl: row.drive_url,
    driveFileId: row.drive_file_id,
    folder: row.folder || "",
    visibleText: row.visible_text || "",
    peopleDescriptions: row.people_descriptions || "",
    sceneDescription: row.scene_description || "",
    faceCount: row.face_count || 0,
    mimeType: row.mime_type || "",
    processedAt: row.processed_at || row.created_at || "",
    thumbnailUrl: row.drive_file_id
      ? `https://lh3.googleusercontent.com/d/${row.drive_file_id}=w400`
      : "",
    downloadUrl: row.drive_file_id
      ? `https://drive.google.com/uc?export=download&id=${row.drive_file_id}`
      : "",
  };
}

function driveFilesToPhotos(files: DriveFile[], folder: string): PhotoRecord[] {
  return files.map((f) => ({
    id: "",
    filename: f.name,
    driveUrl: `https://drive.google.com/file/d/${f.id}/view`,
    driveFileId: f.id,
    folder,
    visibleText: "",
    peopleDescriptions: "",
    sceneDescription: "",
    faceCount: 0,
    mimeType: f.mimeType || "",
    processedAt: f.modifiedTime || "",
    thumbnailUrl: `https://lh3.googleusercontent.com/d/${f.id}=w400`,
    downloadUrl: `https://drive.google.com/uc?export=download&id=${f.id}`,
  }));
}

const METADATA_COLUMNS = [
  "id", "drive_file_id", "filename", "drive_url", "folder",
  "visible_text", "people_descriptions", "scene_description",
  "face_count", "mime_type", "processed_at", "created_at",
  "status", "error_message",
].join(",");

async function fetchSupabaseMetadata(): Promise<Map<string, PhotoRow>> {
  if (!supabaseAvailable()) return new Map();
  try {
    const { createServerClient } = await import("./supabase");
    const supabase = createServerClient();
    const { data, error } = await supabase
      .from("photos")
      .select(METADATA_COLUMNS)
      .eq("status", "completed");
    if (error) return new Map();
    const map = new Map<string, PhotoRow>();
    for (const row of data as PhotoRow[]) map.set(row.drive_file_id, row);
    return map;
  } catch {
    return new Map();
  }
}

export async function fetchPhotosWithMetadata(): Promise<PhotoRecord[]> {
  const drivePhotos = config.driveFolderId
    ? await fetchPhotosFromDriveFolder()
    : await fetchPhotos();

  const metadata = await fetchSupabaseMetadata();
  if (metadata.size === 0) return drivePhotos;

  for (const photo of drivePhotos) {
    const row = metadata.get(photo.driveFileId);
    if (row) {
      photo.visibleText = row.visible_text || "";
      photo.peopleDescriptions = row.people_descriptions || "";
      photo.sceneDescription = row.scene_description || "";
      photo.faceCount = row.face_count || 0;
      if (row.mime_type) photo.mimeType = row.mime_type;
      if (row.processed_at) photo.processedAt = row.processed_at;
    }
  }

  return drivePhotos;
}

export function extractDriveFileId(driveUrl: string): string {
  const fileMatch = driveUrl.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
  if (fileMatch) return fileMatch[1];
  const openMatch = driveUrl.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (openMatch) return openMatch[1];
  return "";
}

export async function fetchPhotosFromDriveFolder(): Promise<PhotoRecord[]> {
  const { driveFolderId, googleApiKey } = config;
  if (!driveFolderId || !googleApiKey) return [];

  try {
    const opts = { revalidate: 30 };
    const [rootFiles, subfolders] = await Promise.all([
      listDriveImages(driveFolderId, googleApiKey, opts),
      listDriveSubfolders(driveFolderId, googleApiKey, opts),
    ]);

    const allPhotos = driveFilesToPhotos(rootFiles, "Root");

    if (subfolders.length > 0) {
      const subResults = await Promise.all(
        subfolders.map(async (sf) => {
          const files = await listDriveImages(sf.id, googleApiKey, opts);
          return driveFilesToPhotos(files, sf.name);
        }),
      );
      for (const photos of subResults) allPhotos.push(...photos);
    }

    allPhotos.sort(
      (a, b) => new Date(b.processedAt).getTime() - new Date(a.processedAt).getTime(),
    );
    allPhotos.forEach((p, i) => { p.id = String(i + 1); });

    return allPhotos;
  } catch {
    return [];
  }
}

export async function fetchPhotos(): Promise<PhotoRecord[]> {
  const { sheetId } = config;
  if (!sheetId) return [];

  const url = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:json`;
  const res = await fetch(url, {
    next: { revalidate: 30 },
    headers: { "X-DataSource-Auth": "true" },
  } as RequestInit);

  if (!res.ok) return [];

  const text = await res.text();

  let jsonStr: string | null = null;
  const jsonpMatch = text.match(/google\.visualization\.Query\.setResponse\(({[\s\S]*})\)/);
  if (jsonpMatch) jsonStr = jsonpMatch[1];
  if (!jsonStr) {
    const xssiMatch = text.match(/^\)\]\}'\s*\n?([\s\S]+)/);
    if (xssiMatch) jsonStr = xssiMatch[1].trim();
  }
  if (!jsonStr) {
    const braceStart = text.indexOf("{");
    if (braceStart !== -1) jsonStr = text.slice(braceStart);
  }
  if (!jsonStr) return [];

  let data: {
    table?: { rows?: Array<{ c: Array<{ v?: string | number | null } | null> }> };
  };
  try {
    data = JSON.parse(jsonStr);
  } catch {
    return [];
  }

  const rows = data.table?.rows || [];
  const photos: PhotoRecord[] = rows
    .map((row, index) => {
      const cells = row.c || [];
      const filename = String(cells[0]?.v ?? "");
      if (!filename) return null;

      const driveUrl = String(cells[1]?.v ?? "");
      const driveFileId = extractDriveFileId(driveUrl);

      return {
        id: String(index + 2),
        filename,
        driveUrl,
        driveFileId,
        folder: String(cells[2]?.v ?? ""),
        visibleText: String(cells[3]?.v ?? ""),
        peopleDescriptions: String(cells[4]?.v ?? ""),
        sceneDescription: String(cells[5]?.v ?? ""),
        faceCount: parseInt(String(cells[6]?.v ?? "0"), 10) || 0,
        mimeType: "",
        processedAt: String(cells[7]?.v ?? ""),
        thumbnailUrl: driveFileId ? `https://lh3.googleusercontent.com/d/${driveFileId}=w400` : "",
        downloadUrl: driveFileId ? `https://drive.google.com/uc?export=download&id=${driveFileId}` : "",
      };
    })
    .filter((p): p is PhotoRecord => p !== null);

  photos.sort(
    (a, b) => new Date(b.processedAt).getTime() - new Date(a.processedAt).getTime(),
  );

  return photos;
}

export function searchPhotos(query: string, photos: PhotoRecord[]): PhotoRecord[] {
  const terms = query.toLowerCase().split(/\s+/).filter((t) => t.length > 0);
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
        if (fields.visibleText.includes(term)) { score += 10; termMatch = true; }
        if (fields.filename.includes(term)) { score += 5; termMatch = true; }
        if (fields.folder.includes(term)) { score += 5; termMatch = true; }
        if (fields.peopleDescriptions.includes(term)) { score += 3; termMatch = true; }
        if (fields.sceneDescription.includes(term)) { score += 2; termMatch = true; }
        if (!termMatch) { allTermsMatch = false; break; }
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
    if (photo.folder) folders.add(photo.folder);
  }
  return Array.from(folders).sort();
}

export async function fetchDriveFolders(): Promise<string[]> {
  const { driveFolderId, googleApiKey } = config;
  if (!driveFolderId || !googleApiKey) return [];
  try {
    const folders = await listDriveSubfolders(driveFolderId, googleApiKey, { revalidate: 30 });
    return folders.map((f) => f.name).sort();
  } catch {
    return [];
  }
}
