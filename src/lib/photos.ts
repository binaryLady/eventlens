import { PhotoRecord } from "./types";
import { config } from "./config";

export function extractDriveFileId(driveUrl: string): string {
  // https://drive.google.com/file/d/{ID}/view
  // https://drive.google.com/file/d/{ID}/view?usp=sharing
  const fileMatch = driveUrl.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
  if (fileMatch) return fileMatch[1];

  // https://drive.google.com/open?id={ID}
  const openMatch = driveUrl.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (openMatch) return openMatch[1];

  return "";
}

export async function fetchPhotos(): Promise<PhotoRecord[]> {
  const { sheetId, apiKey } = config;

  if (!sheetId) {
    console.error("Missing GOOGLE_SHEET_ID");
    return [];
  }
  if (!apiKey) {
    console.error("Missing GOOGLE_SHEETS_API_KEY");
    return [];
  }

  const url = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/A2:H?key=${apiKey}`;

  const res = await fetch(url, { next: { revalidate: 30 } });

  if (!res.ok) {
    console.error(`Sheets API error: ${res.status} ${res.statusText}`);
    return [];
  }

  const data = await res.json();
  const rows: string[][] = data.values || [];

  const photos: PhotoRecord[] = rows
    .map((row, index) => {
      const filename = row[0] || "";
      const driveUrl = row[1] || "";
      const folder = row[2] || "";
      const visibleText = row[3] || "";
      const peopleDescriptions = row[4] || "";
      const sceneDescription = row[5] || "";
      const faceCount = parseInt(row[6] || "0", 10) || 0;
      const processedAt = row[7] || "";

      if (!filename) return null;

      const driveFileId = extractDriveFileId(driveUrl);

      return {
        id: String(index + 2),
        filename,
        driveUrl,
        driveFileId,
        folder,
        visibleText,
        peopleDescriptions,
        sceneDescription,
        faceCount,
        processedAt,
        thumbnailUrl: driveFileId
          ? `https://lh3.googleusercontent.com/d/${driveFileId}=w400`
          : "",
        downloadUrl: driveFileId
          ? `https://drive.google.com/uc?export=download&id=${driveFileId}`
          : "",
      };
    })
    .filter((p): p is PhotoRecord => p !== null);

  photos.sort(
    (a, b) =>
      new Date(b.processedAt).getTime() - new Date(a.processedAt).getTime()
  );

  return photos;
}

export function searchPhotos(
  query: string,
  photos: PhotoRecord[]
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
