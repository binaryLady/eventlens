// @TheTechMargin 2026

export interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime?: string;
  owners?: Array<{ displayName: string }>;
  imageMediaMetadata?: {
    cameraMake?: string;
    cameraModel?: string;
  };
}

interface FetchOpts {
  revalidate?: number;
}

function fetchInit(opts?: FetchOpts): RequestInit {
  if (!opts?.revalidate) return {};
  return { next: { revalidate: opts.revalidate } } as RequestInit;
}

export async function fetchDriveImage(
  fileId: string,
  apiKey: string,
  width = 1200,
): Promise<{ base64: string; mimeType: string } | null> {
  try {
    const res = await fetch(`https://lh3.googleusercontent.com/d/${fileId}=w${width}`);
    if (res.ok) {
      const ct = res.headers.get("content-type") || "";
      if (ct.startsWith("image/")) {
        const buf = await res.arrayBuffer();
        return { base64: Buffer.from(buf).toString("base64"), mimeType: ct };
      }
    }
  } catch {}

  try {
    const res = await fetch(
      `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media&key=${apiKey}`,
    );
    if (!res.ok) return null;
    const ct = res.headers.get("content-type") || "";
    if (!ct.startsWith("image/")) return null;
    const buf = await res.arrayBuffer();
    return { base64: Buffer.from(buf).toString("base64"), mimeType: ct };
  } catch {
    return null;
  }
}

export async function listDriveSubfolders(
  parentId: string,
  apiKey: string,
  opts?: FetchOpts,
): Promise<Array<{ id: string; name: string }>> {
  const folders: Array<{ id: string; name: string }> = [];
  let pageToken: string | undefined;

  do {
    const q = encodeURIComponent(
      `'${parentId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
    );
    const pt = pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : "";
    const url = `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name),nextPageToken&orderBy=name&pageSize=200&key=${apiKey}${pt}`;

    const res = await fetch(url, fetchInit(opts));
    if (!res.ok) break;

    const data: { files?: Array<{ id: string; name: string }>; nextPageToken?: string } =
      await res.json();
    if (data.files) folders.push(...data.files);
    pageToken = data.nextPageToken;
  } while (pageToken);

  return folders;
}

export async function listDriveImages(
  folderId: string,
  apiKey: string,
  opts?: FetchOpts,
): Promise<DriveFile[]> {
  const files: DriveFile[] = [];
  let pageToken: string | undefined;

  do {
    const q = encodeURIComponent(
      `'${folderId}' in parents and (mimeType contains 'image/' or mimeType contains 'video/') and trashed = false`,
    );
    const pt = pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : "";
    const url = `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name,mimeType,modifiedTime,owners(displayName),imageMediaMetadata(cameraMake,cameraModel)),nextPageToken&orderBy=modifiedTime%20desc&pageSize=1000&key=${apiKey}${pt}`;

    const res = await fetch(url, fetchInit(opts));
    if (!res.ok) break;

    const data: { files?: DriveFile[]; nextPageToken?: string } = await res.json();
    if (data.files) files.push(...data.files);
    pageToken = data.nextPageToken;
  } while (pageToken);

  return files;
}
