// @TheTechMargin 2026
// Google Drive operations for the pipeline.
// Reuses listDriveImages and listDriveSubfolders from src/lib/drive.ts.
// Adds downloadAsBase64 for pipeline image processing.

import { listDriveImages, listDriveSubfolders, type DriveFile } from "@/lib/drive";

export { listDriveImages, listDriveSubfolders, type DriveFile };

const DRIVE_API = "https://www.googleapis.com/drive/v3/files";

/**
 * Download an image from Google Drive as base64.
 * Tries CDN first (lh3.googleusercontent.com), falls back to Drive API.
 */
export async function downloadAsBase64(
  fileId: string,
  apiKey: string,
  width = 1200,
): Promise<{ base64: string; mimeType: string } | null> {
  // Try CDN first
  try {
    const cdnUrl = `https://lh3.googleusercontent.com/d/${fileId}=w${width}`;
    const res = await fetch(cdnUrl);
    if (res.ok) {
      const ct = res.headers.get("content-type") || "";
      if (ct.startsWith("image/") || ct.startsWith("video/")) {
        const buf = await res.arrayBuffer();
        return { base64: Buffer.from(buf).toString("base64"), mimeType: ct };
      }
    }
  } catch {
    // CDN failed, try Drive API
  }

  // Fallback to Drive API
  try {
    const res = await fetch(`${DRIVE_API}/${fileId}?alt=media&key=${apiKey}`);
    if (!res.ok) return null;
    const ct = res.headers.get("content-type") || "";
    if (!ct.startsWith("image/") && !ct.startsWith("video/")) return null;
    const buf = await res.arrayBuffer();
    return { base64: Buffer.from(buf).toString("base64"), mimeType: ct };
  } catch {
    return null;
  }
}
