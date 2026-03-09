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

/**
 * Fetch photo metadata from a public Google Sheet.
 * Uses the Google Visualization API (gviz/tq) which works when the sheet
 * is shared as "Anyone with the link" — no API key needed.
 */
export async function fetchPhotos(): Promise<PhotoRecord[]> {
  const { sheetId } = config;

  if (!sheetId) {
    console.error("Missing GOOGLE_SHEET_ID");
    return [];
  }

  // Google Visualization API — works with "Anyone with the link" sharing
  const url = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:json`;

  const res = await fetch(url, {
    next: { revalidate: 30 },
    headers: {
      // Avoid Google returning an HTML sign-in page
      "X-DataSource-Auth": "true",
    },
  });

  if (!res.ok) {
    console.error(
      `Google Sheets fetch error: ${res.status} ${res.statusText}`,
    );
    return [];
  }

  const text = await res.text();

  // Response is JSONP-wrapped: google.visualization.Query.setResponse({...})
  // Strip the wrapper to get pure JSON
  const jsonMatch = text.match(
    /google\.visualization\.Query\.setResponse\(({[\s\S]*})\)/,
  );
  if (!jsonMatch) {
    console.error("Could not parse Google Sheets response");
    return [];
  }

  let data: {
    table?: {
      rows?: Array<{
        c: Array<{ v?: string | number | null } | null>;
      }>;
    };
  };

  try {
    data = JSON.parse(jsonMatch[1]);
  } catch (e) {
    console.error("Failed to parse sheet JSON:", e);
    return [];
  }

  const rows = data.table?.rows || [];

  const photos: PhotoRecord[] = rows
    .map((row, index) => {
      const cells = row.c || [];
      const filename = String(cells[0]?.v ?? "");
      const driveUrl = String(cells[1]?.v ?? "");
      const folder = String(cells[2]?.v ?? "");
      const visibleText = String(cells[3]?.v ?? "");
      const peopleDescriptions = String(cells[4]?.v ?? "");
      const sceneDescription = String(cells[5]?.v ?? "");
      const faceCount = parseInt(String(cells[6]?.v ?? "0"), 10) || 0;
      const processedAt = String(cells[7]?.v ?? "");

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
      new Date(b.processedAt).getTime() - new Date(a.processedAt).getTime(),
  );

  return photos;
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
