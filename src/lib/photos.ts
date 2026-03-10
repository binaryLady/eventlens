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
 * Fetch all image files from a Google Drive folder and its subfolders.
 * Recursively searches subfolders for images (jpg, jpeg, png, gif, webp, bmp).
 */
export async function fetchPhotosFromDriveFolder(): Promise<PhotoRecord[]> {
  const { driveFolderId, googleApiKey } = config;

  if (!driveFolderId || !googleApiKey) {
    return [];
  }

  const mimeTypes = [
    "image/jpeg",
    "image/png",
    "image/gif",
    "image/webp",
    "image/bmp",
  ];
  const mimeQuery = mimeTypes.map((t) => `mimeType='${t}'`).join(" or ");

  /** Fetch all image files from a single folder (paginated) */
  async function fetchImagesInFolder(
    folderId: string,
    folderName: string,
  ): Promise<PhotoRecord[]> {
    const photos: PhotoRecord[] = [];
    const query = encodeURIComponent(
      `'${folderId}' in parents and (${mimeQuery}) and trashed = false`,
    );

    let pageToken: string | undefined;
    do {
      const pageTokenParam = pageToken ? `&pageToken=${pageToken}` : "";
      const url = `https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id,name,mimeType,modifiedTime),nextPageToken&orderBy=modifiedTime%20desc&pageSize=1000&key=${googleApiKey}${pageTokenParam}`;

      const res = await fetch(url, { next: { revalidate: 30 } });
      if (!res.ok) {
        const body = await res.text();
        throw new Error(`Drive API ${res.status}: ${body}`);
      }

      const data: {
        files?: Array<{
          id: string;
          name: string;
          mimeType: string;
          modifiedTime: string;
        }>;
        nextPageToken?: string;
      } = await res.json();

      if (data.files) {
        for (const file of data.files) {
          photos.push({
            id: "",
            filename: file.name,
            driveUrl: `https://drive.google.com/file/d/${file.id}/view`,
            driveFileId: file.id,
            folder: folderName,
            visibleText: "",
            peopleDescriptions: "",
            sceneDescription: "",
            faceCount: 0,
            processedAt: file.modifiedTime,
            thumbnailUrl: `https://lh3.googleusercontent.com/d/${file.id}=w400`,
            downloadUrl: `https://drive.google.com/uc?export=download&id=${file.id}`,
          });
        }
      }

      pageToken = data.nextPageToken;
    } while (pageToken);

    return photos;
  }

  /** Fetch all subfolder IDs and names from a folder (paginated) */
  async function fetchSubfolders(
    parentId: string,
  ): Promise<Array<{ id: string; name: string }>> {
    const subfolders: Array<{ id: string; name: string }> = [];
    const query = encodeURIComponent(
      `'${parentId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
    );

    let pageToken: string | undefined;
    do {
      const pageTokenParam = pageToken ? `&pageToken=${pageToken}` : "";
      const url = `https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id,name),nextPageToken&orderBy=name&pageSize=200&key=${googleApiKey}${pageTokenParam}`;

      const res = await fetch(url, { next: { revalidate: 30 } });
      if (!res.ok) {
        const body = await res.text();
        throw new Error(`Drive API ${res.status}: ${body}`);
      }

      const data: {
        files?: Array<{ id: string; name: string }>;
        nextPageToken?: string;
      } = await res.json();

      if (data.files) {
        subfolders.push(...data.files);
      }

      pageToken = data.nextPageToken;
    } while (pageToken);

    return subfolders;
  }

  try {
    const allPhotos: PhotoRecord[] = [];

    // Fetch images from root folder and discover subfolders in parallel
    const [rootImages, subfolders] = await Promise.all([
      fetchImagesInFolder(driveFolderId, "Root"),
      fetchSubfolders(driveFolderId),
    ]);
    allPhotos.push(...rootImages);

    // Fetch images from all subfolders in parallel
    if (subfolders.length > 0) {
      const subfolderResults = await Promise.all(
        subfolders.map((sf) => fetchImagesInFolder(sf.id, sf.name)),
      );
      for (const photos of subfolderResults) {
        allPhotos.push(...photos);
      }
    }

    // Assign sequential IDs and sort by modification time descending
    allPhotos.sort(
      (a, b) =>
        new Date(b.processedAt).getTime() - new Date(a.processedAt).getTime(),
    );
    allPhotos.forEach((p, i) => {
      p.id = String(i + 1);
    });

    return allPhotos;
  } catch (error) {
    console.error("Failed to fetch photos from Drive folder:", error);
    return [];
  }
}

/**
 * Fetch photo metadata from a public Google Sheet (fallback if Drive isn't configured).
 * Uses the Google Visualization API (gviz/tq) which works when the sheet
 * is shared as "Anyone with the link" — no API key needed.
 */
// @TheTechMargin 2026
export async function fetchPhotos(): Promise<PhotoRecord[]> {
  const { sheetId } = config;

  if (!sheetId) {
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
    return [];
  }

  const text = await res.text();

  // Google returns two possible formats depending on context:
  // 1. JSONP: google.visualization.Query.setResponse({...})
  // 2. Anti-XSSI prefix: )]}'  followed by raw JSON on next line
  let jsonStr: string | null = null;

  // Try JSONP format first
  const jsonpMatch = text.match(
    /google\.visualization\.Query\.setResponse\(({[\s\S]*})\)/,
  );
  if (jsonpMatch) {
    jsonStr = jsonpMatch[1];
  }

  // Try anti-XSSI prefix format: )]}'  or )]}' followed by JSON
  if (!jsonStr) {
    const xssiMatch = text.match(/^\)\]\}'\s*\n?([\s\S]+)/);
    if (xssiMatch) {
      jsonStr = xssiMatch[1].trim();
    }
  }

  // Fallback: try to find any JSON object in the response
  if (!jsonStr) {
    const braceStart = text.indexOf("{");
    if (braceStart !== -1) {
      jsonStr = text.slice(braceStart);
    }
  }

  if (!jsonStr) {
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
    data = JSON.parse(jsonStr);
  } catch {
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

/**
 * Fetch all subfolder names from the Google Drive parent folder.
 * Uses Drive API v3 with pagination to support any number of subdirectories.
 * Requires the folder to be publicly shared and a valid API key.
 * Falls back to photo-derived folders if the Drive folder ID or API key is missing.
 */
export async function fetchDriveFolders(): Promise<string[]> {
  const { driveFolderId, googleApiKey } = config;

  if (!driveFolderId || !googleApiKey) {
    return [];
  }

  try {
    const allFolders: string[] = [];
    let pageToken: string | undefined;

    do {
      const query = encodeURIComponent(
        `'${driveFolderId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
      );
      const pageTokenParam = pageToken ? `&pageToken=${pageToken}` : "";
      const url = `https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(name),nextPageToken&orderBy=name&pageSize=200&key=${googleApiKey}${pageTokenParam}`;

      const res = await fetch(url, { next: { revalidate: 30 } });
      if (!res.ok) {
        const body = await res.text();
        throw new Error(`Drive API ${res.status}: ${body}`);
      }

      const data: {
        files?: Array<{ name: string }>;
        nextPageToken?: string;
      } = await res.json();

      if (data.files) {
        allFolders.push(...data.files.map((f) => f.name));
      }

      pageToken = data.nextPageToken;
    } while (pageToken);

    return allFolders.sort();
  } catch (error) {
    console.error("Failed to fetch Drive folders:", error);
    return [];
  }
}
