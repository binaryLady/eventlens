import { NextRequest, NextResponse } from "next/server";
import { fetchPhotos } from "@/lib/photos";
import { describePersonForMatching, verifyFaceMatches } from "@/lib/gemini";
import { PhotoRecord, MatchResult } from "@/lib/types";

export const maxDuration = 60; // Allow up to 60s for face matching

/**
 * POST /api/match
 * Accepts an uploaded photo and finds matching people across all event photos
 * in Google Drive by visual face comparison via Gemini.
 *
 * Body: { image: string (base64), mimeType: string }
 * Returns: { matches: MatchResult[], description: string }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { image, mimeType } = body;

    if (!image || !mimeType) {
      return NextResponse.json(
        { error: "Missing image or mimeType" },
        { status: 400 },
      );
    }

    // Phase 1: Describe the person in the uploaded photo
    const description = await describePersonForMatching(image, mimeType);

    if (description.includes("NO_PERSON_DETECTED")) {
      return NextResponse.json({
        matches: [],
        description: "",
        error:
          "No person detected in the uploaded photo. Please upload a clear photo of a person.",
      });
    }

    // Fetch all event photos from the Sheet
    const allPhotos = await fetchPhotos();

    if (allPhotos.length === 0) {
      return NextResponse.json({
        matches: [],
        description,
        error: "No event photos available yet.",
      });
    }

    // Phase 2: Text pre-filter to rank candidates (cheap, instant)
    const descTerms = description
      .toLowerCase()
      .split(/[,\s]+/)
      .filter((t) => t.length > 2);

    const textScored = scoreByDescription(allPhotos, descTerms);

    // Build candidate list: text-matched first, then remaining photos with images
    const candidateIds = new Set<string>();
    const candidates: PhotoRecord[] = [];

    // Add text-matched photos first (best candidates)
    for (const item of textScored) {
      if (item.photo.driveFileId) {
        candidateIds.add(item.photo.id);
        candidates.push(item.photo);
      }
    }

    // Then add remaining photos that have Drive file IDs
    for (const photo of allPhotos) {
      if (!candidateIds.has(photo.id) && photo.driveFileId) {
        candidates.push(photo);
      }
    }

    // Cap at 50 to keep Gemini costs and latency reasonable
    const capped = candidates.slice(0, 50);

    // Phase 3: Visual face matching — fetch Drive thumbnails, send to Gemini
    const matches = await visuallyVerifyCandidates(image, mimeType, capped);

    return NextResponse.json({ matches, description });
  } catch (error) {
    console.error("Match error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to process photo match",
      },
      { status: 500 },
    );
  }
}

function scoreByDescription(
  photos: PhotoRecord[],
  descTerms: string[],
): Array<{ photo: PhotoRecord; score: number }> {
  const scored = photos
    .map((photo) => {
      const text = [
        photo.peopleDescriptions,
        photo.sceneDescription,
        photo.visibleText,
      ]
        .join(" ")
        .toLowerCase();

      let score = 0;
      for (const term of descTerms) {
        if (text.includes(term)) score += 1;
      }
      if (photo.faceCount > 0) score += 1;

      return { photo, score };
    })
    .filter((item) => item.score > 0);

  scored.sort((a, b) => b.score - a.score);
  return scored;
}

async function visuallyVerifyCandidates(
  uploadedImageBase64: string,
  uploadedMimeType: string,
  candidates: PhotoRecord[],
): Promise<MatchResult[]> {
  const BATCH_SIZE = 10;
  const allMatches: MatchResult[] = [];

  for (let i = 0; i < candidates.length; i += BATCH_SIZE) {
    const batch = candidates.slice(i, i + BATCH_SIZE);

    // Fetch thumbnails from Google Drive in parallel
    const thumbnails = await Promise.all(
      batch.map(async (photo) => {
        try {
          const thumbUrl = `https://lh3.googleusercontent.com/d/${photo.driveFileId}=w300`;
          const res = await fetch(thumbUrl);
          if (!res.ok) return null;

          const buffer = await res.arrayBuffer();
          const base64 = Buffer.from(buffer).toString("base64");
          const contentType = res.headers.get("content-type") || "image/jpeg";

          return { id: photo.id, imageBase64: base64, mimeType: contentType };
        } catch {
          return null;
        }
      }),
    );

    const valid = thumbnails.filter(
      (t): t is { id: string; imageBase64: string; mimeType: string } =>
        t !== null,
    );

    if (valid.length === 0) continue;

    const matches = await verifyFaceMatches(
      uploadedImageBase64,
      uploadedMimeType,
      valid,
    );

    for (const match of matches) {
      const photo = batch.find((p) => p.id === match.id);
      if (photo) {
        allMatches.push({
          photo,
          confidence: match.confidence,
          reason: match.reason,
        });
      }
    }
  }

  allMatches.sort((a, b) => b.confidence - a.confidence);
  return allMatches;
}
