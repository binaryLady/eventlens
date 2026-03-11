// @TheTechMargin 2026
import { NextRequest, NextResponse } from "next/server";
import { rowToPhoto } from "@/lib/photos";
import { PhotoRecord, MatchResult } from "@/lib/types";
import { saveMatchSession, getPhotosByDriveFileIds, findSimilarSessions, getCooccurrenceRecommendations } from "@/lib/supabase";

export const maxDuration = 60;

const FACE_API_URL = process.env.FACE_API_URL || "";
const FACE_API_SECRET = process.env.FACE_API_SECRET || "";
const EMBED_TIMEOUT_MS = 15_000;
const VECTOR_THRESHOLD = 0.68;
const ALLOWED_MIME = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const MAX_BASE64_SIZE = 10 * 1024 * 1024;

function vectorResponse(
  matches: MatchResult[],
  embedding: number[] | null,
  extra?: { error?: string; recommendations?: string[] },
) {
  saveMatchSession({
    tier: "vector",
    matchCount: matches.length,
    topConfidence: matches[0]?.confidence ?? null,
    queryEmbedding: embedding,
    matchedPhotoIds: matches.map((m) => m.photo.driveFileId),
  });
  return NextResponse.json({
    matches,
    description: "",
    tier: "vector",
    ...(extra?.error ? { error: extra.error } : {}),
    ...(extra?.recommendations ? { recommendations: extra.recommendations } : {}),
  });
}

export async function POST(request: NextRequest) {
  try {
    const { image, mimeType } = await request.json();
    if (!image || !mimeType) {
      return NextResponse.json({ error: "Missing image or mimeType" }, { status: 400 });
    }
    if (!ALLOWED_MIME.includes(mimeType)) {
      return NextResponse.json({ error: "Invalid image type" }, { status: 400 });
    }
    if (typeof image !== "string" || image.length > MAX_BASE64_SIZE) {
      return NextResponse.json({ error: "Image too large" }, { status: 400 });
    }
    if (!FACE_API_URL) {
      return NextResponse.json({ error: "Face matching service is not configured." }, { status: 503 });
    }

    return vectorMatch(image);
  } catch {
    return NextResponse.json({ error: "Failed to process photo match" }, { status: 500 });
  }
}

async function vectorMatch(imageBase64: string) {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (FACE_API_SECRET) headers["Authorization"] = `Bearer ${FACE_API_SECRET}`;

  let embedRes: Response;
  try {
    embedRes = await fetch(`${FACE_API_URL}/embed`, {
      method: "POST",
      headers,
      body: JSON.stringify({ image: imageBase64 }),
      signal: AbortSignal.timeout(EMBED_TIMEOUT_MS),
    });
  } catch {
    return NextResponse.json(
      { error: "Face matching service is temporarily unavailable. Please try again shortly." },
      { status: 503 },
    );
  }

  if (!embedRes.ok) {
    return NextResponse.json(
      { error: "Face matching service error. Please try again shortly." },
      { status: 502 },
    );
  }

  const embedData: {
    faces: Array<{ embedding: number[]; det_score: number }>;
    count: number;
  } = await embedRes.json();

  if (embedData.count === 0) {
    return vectorResponse([], null, { error: "No face detected in the uploaded photo. Please upload a clear photo of a person." });
  }

  const bestFace = embedData.faces.reduce((a, b) => (a.det_score > b.det_score ? a : b));

  const { matchFacesByEmbedding } = await import("@/lib/supabase");
  const faceMatches = await matchFacesByEmbedding(bestFace.embedding, VECTOR_THRESHOLD, 30);

  if (faceMatches.length === 0) {
    const similar = await findSimilarSessions(bestFace.embedding, 0.7, 1);
    if (similar.length > 0 && similar[0].match_count > 0) {
      return vectorResponse([], bestFace.embedding, {
        error: "We've seen a similar face before but couldn't match this time. Try a clearer, well-lit photo.",
      });
    }
    return vectorResponse([], bestFace.embedding);
  }

  const bestByPhoto = new Map<string, { similarity: number; face_index: number }>();
  for (const fm of faceMatches) {
    const existing = bestByPhoto.get(fm.drive_file_id);
    if (!existing || fm.similarity > existing.similarity) {
      bestByPhoto.set(fm.drive_file_id, { similarity: fm.similarity, face_index: fm.face_index });
    }
  }

  const photoRows = await getPhotosByDriveFileIds(Array.from(bestByPhoto.keys()));
  const photoByFileId = new Map<string, PhotoRecord>();
  for (const row of photoRows) photoByFileId.set(row.drive_file_id, rowToPhoto(row));

  const matches: MatchResult[] = [];
  bestByPhoto.forEach((match, fileId) => {
    const photo = photoByFileId.get(fileId);
    if (!photo) return;
    matches.push({
      photo,
      confidence: Math.round(match.similarity * 100),
      reason: `Face match (vector similarity ${(match.similarity * 100).toFixed(0)}%)`,
      tier: "vector",
    });
  });
  matches.sort((a, b) => b.confidence - a.confidence);

  const matchedIds = matches.map((m) => m.photo.driveFileId);
  const recommendations = await getCooccurrenceRecommendations(matchedIds, matchedIds, 8);

  return vectorResponse(matches, bestFace.embedding, {
    recommendations: recommendations.length > 0 ? recommendations : undefined,
  });
}
