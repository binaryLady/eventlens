// @TheTechMargin 2026
// Google Drive Service Account Authentication
// Uses raw HTTP requests with JWT (no googleapis dependency)

import type { DriveFile } from "./drive";

// Simple JWT creation for Google OAuth2
async function createJWT(): Promise<string> {
  const clientEmail = process.env.GOOGLE_CLIENT_EMAIL;
  const privateKey = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n");

  if (!clientEmail || !privateKey) {
    throw new Error("Service Account credentials not configured");
  }

  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const payload = {
    iss: clientEmail,
    scope: "https://www.googleapis.com/auth/drive.readonly",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  };

  const encoder = new TextEncoder();
  const headerB64 = btoa(JSON.stringify(header))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  const payloadB64 = btoa(JSON.stringify(payload))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  const unsignedToken = `${headerB64}.${payloadB64}`;

  // Import the private key and sign
  const pemHeader = "-----BEGIN PRIVATE KEY-----";
  const pemFooter = "-----END PRIVATE KEY-----";
  const pemContents = privateKey
    .replace(pemHeader, "")
    .replace(pemFooter, "")
    .replace(/\s/g, "");
  const binaryDer = Uint8Array.from(atob(pemContents), (c) => c.charCodeAt(0));

  const cryptoKey = await crypto.subtle.importKey(
    "pkcs8",
    binaryDer,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    cryptoKey,
    encoder.encode(unsignedToken)
  );

  const signatureB64 = btoa(String.fromCharCode(...new Uint8Array(signature)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

  return `${unsignedToken}.${signatureB64}`;
}

let cachedToken: { token: string; expiry: number } | null = null;

async function getAccessToken(): Promise<string> {
  // Return cached token if still valid (with 5 min buffer)
  if (cachedToken && cachedToken.expiry > Date.now() + 5 * 60 * 1000) {
    return cachedToken.token;
  }

  const jwt = await createJWT();

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });

  if (!res.ok) {
    const error = await res.text();
    throw new Error(`Failed to get access token: ${error}`);
  }

  const data = await res.json();
  cachedToken = {
    token: data.access_token,
    expiry: Date.now() + data.expires_in * 1000,
  };

  return cachedToken.token;
}

export function isServiceAccountConfigured(): boolean {
  const hasEmail = !!process.env.GOOGLE_CLIENT_EMAIL;
  const hasKey = !!process.env.GOOGLE_PRIVATE_KEY;
  console.log("[v0] isServiceAccountConfigured - email:", hasEmail, "key:", hasKey);
  return hasEmail && hasKey;
}

export async function listDriveImagesWithServiceAccount(
  folderId: string
): Promise<DriveFile[]> {
  console.log("[v0] listDriveImagesWithServiceAccount - folderId:", folderId);
  const accessToken = await getAccessToken();
  console.log("[v0] Got access token:", accessToken ? "YES" : "NO");
  const files: DriveFile[] = [];
  let pageToken: string | undefined;

  do {
    const q = encodeURIComponent(
      `'${folderId}' in parents and (mimeType contains 'image/' or mimeType contains 'video/') and trashed = false`
    );
    const pt = pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : "";
    const url = `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name,mimeType,modifiedTime,owners(displayName),imageMediaMetadata(cameraMake,cameraModel)),nextPageToken&orderBy=modifiedTime%20desc&pageSize=1000${pt}`;

    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
      next: { revalidate: 30 },
    });

    if (!res.ok) {
      const error = await res.text();
      console.error("[drive-sa] API error:", res.status, error);
      break;
    }

    const data: { files?: DriveFile[]; nextPageToken?: string } =
      await res.json();
    console.log("[v0] Drive API returned", data.files?.length || 0, "files");
    if (data.files) files.push(...data.files);
    pageToken = data.nextPageToken;
  } while (pageToken);

  console.log("[v0] Total files from Service Account:", files.length);
  return files;
}

export async function listDriveSubfoldersWithServiceAccount(
  parentId: string
): Promise<Array<{ id: string; name: string }>> {
  const accessToken = await getAccessToken();
  const folders: Array<{ id: string; name: string }> = [];
  let pageToken: string | undefined;

  do {
    const q = encodeURIComponent(
      `'${parentId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`
    );
    const pt = pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : "";
    const url = `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name),nextPageToken&orderBy=name&pageSize=200${pt}`;

    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
      next: { revalidate: 30 },
    });

    if (!res.ok) break;

    const data: {
      files?: Array<{ id: string; name: string }>;
      nextPageToken?: string;
    } = await res.json();
    if (data.files) folders.push(...data.files);
    pageToken = data.nextPageToken;
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
    const accessToken = await getAccessToken();
    const res = await fetch(
      `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );

    if (!res.ok) return null;

    const mimeType =
      res.headers.get("content-type") || "application/octet-stream";
    if (!mimeType.startsWith("image/")) return null;

    const buf = await res.arrayBuffer();
    return { base64: Buffer.from(buf).toString("base64"), mimeType };
  } catch {
    return null;
  }
}
