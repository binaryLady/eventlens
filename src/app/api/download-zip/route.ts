import { NextRequest, NextResponse } from "next/server";
import JSZip from "jszip";
import { config } from "@/lib/config";

export const maxDuration = 60;

interface FileEntry {
  fileId: string;
  filename?: string;
}

// @TheTechMargin 2026
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { files } = body as { files: FileEntry[] };

    if (!Array.isArray(files) || files.length === 0) {
      return NextResponse.json(
        { error: "No files provided" },
        { status: 400 },
      );
    }

    if (files.length > 50) {
      return NextResponse.json(
        { error: "Maximum 50 files per ZIP download" },
        { status: 400 },
      );
    }

    const zip = new JSZip();
    const CONCURRENCY = 10;
    const usedNames = new Set<string>();

    for (let i = 0; i < files.length; i += CONCURRENCY) {
      const batch = files.slice(i, i + CONCURRENCY);

      const results = await Promise.all(
        batch.map(async (entry, batchIndex) => {
          try {
            // Use Drive API for reliable server-side access to public files
            const url = config.googleApiKey
              ? `https://www.googleapis.com/drive/v3/files/${entry.fileId}?alt=media&key=${config.googleApiKey}`
              : `https://lh3.googleusercontent.com/d/${entry.fileId}=w1600`;
            const res = await fetch(url);
            if (!res.ok) return null;

            const contentType =
              res.headers.get("content-type") || "image/jpeg";
            if (!contentType.startsWith("image/")) return null;
            const ext = contentType.includes("png") ? "png" : "jpg";
            const data = await res.arrayBuffer();

            // Use original filename if available, else sequential
            let name = entry.filename
              ? entry.filename.replace(/\.[^.]+$/, `.${ext}`)
              : `photo_${String(i + batchIndex + 1).padStart(3, "0")}.${ext}`;

            // Deduplicate filenames
            if (usedNames.has(name)) {
              const base = name.replace(/\.[^.]+$/, "");
              const extension = name.match(/\.[^.]+$/)?.[0] || `.${ext}`;
              let counter = 2;
              while (usedNames.has(`${base}_${counter}${extension}`)) {
                counter++;
              }
              name = `${base}_${counter}${extension}`;
            }
            usedNames.add(name);

            return { name, data };
          } catch {
            return null;
          }
        }),
      );

      for (const result of results) {
        if (result) {
          zip.file(result.name, result.data);
        }
      }
    }

    const entryCount = Object.keys(zip.files).length;
    if (entryCount === 0) {
      return NextResponse.json(
        { error: "Failed to fetch any images" },
        { status: 500 },
      );
    }

    const zipArrayBuffer = await zip.generateAsync({
      type: "arraybuffer",
      compression: "DEFLATE",
      compressionOptions: { level: 6 },
    });

    return new NextResponse(zipArrayBuffer, {
      status: 200,
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": "attachment; filename=eventlens_photos.zip",
        "Content-Length": String(zipArrayBuffer.byteLength),
      },
    });
  } catch {
    return NextResponse.json(
      { error: "Failed to create ZIP" },
      { status: 500 },
    );
  }
}
