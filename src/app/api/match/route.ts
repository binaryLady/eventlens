import { NextRequest, NextResponse } from "next/server";
import { fetchPhotos } from "@/lib/photos";
import { describePersonForMatching, verifyFaceMatches } from "@/lib/gemini";
import { PhotoRecord, MatchResult } from "@/lib/types";

export const maxDuration = 60; // Allow up to 60s for face matching

/**
 * POST /api/match
 * Accepts an uploaded photo (base64) and finds matching people in the event photos.
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
        error: "No person detected in the uploaded photo. Please upload a clear photo of a person.",
      });
    }

    // Fetch all event photos
    const allPhotos = await fetchPhotos();

    if (allPhotos.length === 0) {
      return NextResponse.json({
        matches: [],
        description,
        error: "No event photos available yet.",
      });
    }

    // Phase 2: Text-based pre-filter using the AI description
    const descTerms = description
      .toLowerCase()
      .split(/[,\s]+/)
      .filter((t) => t.length > 2);

    const candidates = scoreAndRankCandidates(allPhotos, descTerms);

    // Take top candidates for visual verification (limit to manage API costs)
    const topCandidates = candidates.slice(0, 30);

    if (topCandidates.length === 0) {
      // If text matching found nothing, take photos with faces as candidates
      const photosWithFaces = allPhotos
        .filter((p) => p.faceCount > 0)
        .slice(0, 30);

      if (photosWithFaces.length === 0) {
        return NextResponse.json({ matches: [], description });
      }

      // Go directly to visual verification
      const visualMatches = await visuallyVerifyCandidates(
        image,
        mimeType,
        photosWithFaces,
      );

      return NextResponse.json({
        matches: visualMatches,
        description,
      });
    }

    // Phase 3: Visual face verification with Gemini
    const visualMatches = await visuallyVerifyCandidates(
      image,
      mimeType,
      topCandidates.map((c) => c.photo),
    );

    return NextResponse.json({
      matches: visualMatches,
      description,
    });
  } catch (error) {
    console.error("Match error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to process photo match",
      },
      { status: 500 },
    );
  }
}

function scoreAndRankCandidates(
  photos: PhotoRecord[],
  descTerms: string[],
): Array<{ photo: PhotoRecord; score: number }> {
  const scored = photos
    .map((photo) => {
      const peopleDesc = photo.peopleDescriptions.toLowerCase();
      const sceneDesc = photo.sceneDescription.toLowerCase();
      let score = 0;

      for (const term of descTerms) {
        if (peopleDesc.includes(term)) score += 3;
        if (sceneDesc.includes(term)) score += 1;
      }

      // Boost photos that have faces
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
  // Fetch thumbnails for candidates and send to Gemini in batches
  const BATCH_SIZE = 10;
  const allMatches: MatchResult[] = [];

  for (let i = 0; i < candidates.length; i += BATCH_SIZE) {
    const batch = candidates.slice(i, i + BATCH_SIZE);

    // Fetch thumbnails
    const thumbnails = await Promise.all(
      batch.map(async (photo) => {
        try {
          // Use a smaller thumbnail for faster processing
          const thumbUrl = photo.driveFileId
            ? `https://lh3.googleusercontent.com/d/${photo.driveFileId}=w300`
            : "";

          if (!thumbUrl) return null;

          const res = await fetch(thumbUrl);
          if (!res.ok) return null;

          const buffer = await res.arrayBuffer();
          const base64 = Buffer.from(buffer).toString("base64");
          const contentType = res.headers.get("content-type") || "image/jpeg";

          return {
            id: photo.id,
            imageBase64: base64,
            mimeType: contentType,
          };
        } catch {
          return null;
        }
      }),
    );

    const validThumbnails = thumbnails.filter(
      (t): t is { id: string; imageBase64: string; mimeType: string } =>
        t !== null,
    );

    if (validThumbnails.length === 0) continue;

    // Send to Gemini for face comparison
    const matches = await verifyFaceMatches(
      uploadedImageBase64,
      uploadedMimeType,
      validThumbnails,
    );

    // Map matches back to PhotoRecords
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

  // Sort by confidence descending
  allMatches.sort((a, b) => b.confidence - a.confidence);
  return allMatches;
}
