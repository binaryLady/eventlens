// @TheTechMargin 2026
import { NextRequest, NextResponse } from "next/server";
import { config } from "@/lib/config";

export async function GET(request: NextRequest) {
  const fileId = request.nextUrl.searchParams.get("id");
  if (!fileId || !/^[\w-]+$/.test(fileId)) {
    return NextResponse.json({ error: "Invalid file ID" }, { status: 400 });
  }

  const driveUrl = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media&key=${config.googleApiKey}`;
  const rangeHeader = request.headers.get("range");

  const headers: Record<string, string> = {};
  if (rangeHeader) headers["Range"] = rangeHeader;

  const res = await fetch(driveUrl, { headers });

  if (!res.ok && res.status !== 206) {
    return NextResponse.json({ error: "Video not found" }, { status: res.status });
  }

  const contentType = res.headers.get("content-type") || "video/mp4";
  const contentLength = res.headers.get("content-length");
  const contentRange = res.headers.get("content-range");

  const responseHeaders: Record<string, string> = {
    "Content-Type": contentType,
    "Accept-Ranges": "bytes",
    "Cache-Control": "public, max-age=3600",
  };

  if (contentLength) responseHeaders["Content-Length"] = contentLength;
  if (contentRange) responseHeaders["Content-Range"] = contentRange;

  return new NextResponse(res.body, {
    status: res.status,
    headers: responseHeaders,
  });
}
