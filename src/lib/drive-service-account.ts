// @TheTechMargin 2026
// Google Drive Service Account Authentication
// Use this for accessing private/restricted folders

import { google } from "googleapis";
import type { DriveFile } from "./drive";

let driveClient: ReturnType<typeof google.drive> | null = null;

function getServiceAccountCredentials() {
  const clientEmail = process.env.GOOGLE_CLIENT_EMAIL;
  const privateKey = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n");

  if (!clientEmail || !privateKey) {
    return null;
  }

  return { clientEmail, privateKey };
}

function getDriveClient() {
  if (driveClient) return driveClient;

  const credentials = getServiceAccountCredentials();
  if (!credentials) {
    throw new Error("Service Account credentials not configured");
  }

  const auth = new google.auth.GoogleAuth({
    credentials: {
      client_email: credentials.clientEmail,
      private_key: credentials.privateKey,
    },
    scopes: ["https://www.googleapis.com/auth/drive.readonly"],
  });

  driveClient = google.drive({ version: "v3", auth });
  return driveClient;
}

export function isServiceAccountConfigured(): boolean {
  return getServiceAccountCredentials() !== null;
}

export async function listDriveImagesWithServiceAccount(
  folderId: string
): Promise<DriveFile[]> {
  const drive = getDriveClient();
  const files: DriveFile[] = [];
  let pageToken: string | undefined;

  do {
    const response = await drive.files.list({
      q: `'${folderId}' in parents and (mimeType contains 'image/' or mimeType contains 'video/') and trashed = false`,
      fields:
        "files(id,name,mimeType,modifiedTime,owners(displayName),imageMediaMetadata(cameraMake,cameraModel)),nextPageToken",
      orderBy: "modifiedTime desc",
      pageSize: 1000,
      pageToken,
    });

    if (response.data.files) {
      files.push(
        ...response.data.files.map((f) => ({
          id: f.id || "",
          name: f.name || "",
          mimeType: f.mimeType || "",
          modifiedTime: f.modifiedTime || undefined,
          owners: f.owners?.map((o) => ({ displayName: o.displayName || "" })),
          imageMediaMetadata: f.imageMediaMetadata
            ? {
                cameraMake: f.imageMediaMetadata.cameraMake || undefined,
                cameraModel: f.imageMediaMetadata.cameraModel || undefined,
              }
            : undefined,
        }))
      );
    }
    pageToken = response.data.nextPageToken || undefined;
  } while (pageToken);

  return files;
}

export async function listDriveSubfoldersWithServiceAccount(
  parentId: string
): Promise<Array<{ id: string; name: string }>> {
  const drive = getDriveClient();
  const folders: Array<{ id: string; name: string }> = [];
  let pageToken: string | undefined;

  do {
    const response = await drive.files.list({
      q: `'${parentId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
      fields: "files(id,name),nextPageToken",
      orderBy: "name",
      pageSize: 200,
      pageToken,
    });

    if (response.data.files) {
      folders.push(
        ...response.data.files.map((f) => ({
          id: f.id || "",
          name: f.name || "",
        }))
      );
    }
    pageToken = response.data.nextPageToken || undefined;
  } while (pageToken);

  return folders;
}

export async function fetchDriveImageWithServiceAccount(
  fileId: string,
  width = 1200
): Promise<{ base64: string; mimeType: string } | null> {
  // First try the public thumbnail URL (works if file is viewable)
  try {
    const res = await fetch(
      `https://lh3.googleusercontent.com/d/${fileId}=w${width}`
    );
    if (res.ok) {
      const ct = res.headers.get("content-type") || "";
      if (ct.startsWith("image/")) {
        const buf = await res.arrayBuffer();
        return { base64: Buffer.from(buf).toString("base64"), mimeType: ct };
      }
    }
  } catch {}

  // Fall back to Drive API with service account auth
  try {
    const drive = getDriveClient();
    const response = await drive.files.get(
      { fileId, alt: "media" },
      { responseType: "arraybuffer" }
    );

    const mimeType =
      response.headers["content-type"] || "application/octet-stream";
    if (!mimeType.startsWith("image/")) return null;

    const base64 = Buffer.from(response.data as ArrayBuffer).toString("base64");
    return { base64, mimeType };
  } catch {
    return null;
  }
}
