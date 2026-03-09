import { NextRequest, NextResponse } from "next/server";
import { fetchPhotos } from "@/lib/photos";
import { describePersonForMatching, verifyFaceMatches } from "@/lib/gemini";
import { PhotoRecord, MatchResult } from "@/lib/types";
import { config } from "@/lib/config";

export const maxDuration = 60; // Allow up to 60s for face matching

/**
 * POST /api/match
 * Accepts an uploaded photo and finds matching people across all event photos.
 * Uses a two-tier strategy: fast text match first, expensive visual AI fallback only if needed.
 *
 * Body: { image: string (base64), mimeType: string }
 * Returns: { matches: MatchResult[], description: string, tier: "text" | "visual" | "both" }
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

    // Describe the person in the uploaded selfie (one Gemini call — shared by both tiers)
    const description = await describePersonForMatching(image, mimeType);

    if (description.includes("NO_PERSON_DETECTED")) {
      return NextResponse.json({
        matches: [],
        description: "",
        tier: "text",
        error:
          "No person detected in the uploaded photo. Please upload a clear photo of a person.",
      });
    }

    const allPhotos = await fetchPhotos();

    if (allPhotos.length === 0) {
      return NextResponse.json({
        matches: [],
        description,
        tier: "text",
        error: "No event photos available yet.",
      });
    }

    // ── TIER 1: Text match (instant, free) ──────────────────────────────
    const attributeTerms = parseAttributeTerms(description);
    const textMatches = scoreByText(allPhotos, attributeTerms);

    if (textMatches.length >= 3) {
      // Tier 1 produced enough results — return immediately
      return NextResponse.json({
        matches: textMatches,
        description,
        tier: "text",
      });
    }

    // ── TIER 2: Visual AI match (expensive fallback) ────────────────────
    if (!config.googleApiKey) {
      // Can't run Tier 2 without API key — return whatever Tier 1 found
      return NextResponse.json({
        matches: textMatches,
        description,
        tier: "text",
        error: textMatches.length === 0
          ? "Missing GOOGLE_API_KEY — required for visual face matching"
          : undefined,
      });
    }

    const visualMatches = await runVisualMatching(
      image,
      mimeType,
      allPhotos,
      config.googleApiKey,
    );

    // Merge Tier 1 + Tier 2, deduplicate by photo id
    const merged = mergeResults(textMatches, visualMatches);
    const tier = textMatches.length > 0 && visualMatches.length > 0
      ? "both"
      : visualMatches.length > 0
        ? "visual"
        : "text";

    return NextResponse.json({ matches: merged, description, tier });
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

// ── Tier 1 helpers ────────────────────────────────────────────────────────

/**
 * Parse a comma-separated description into cleaned attribute terms.
 * "short brown hair, glasses, blue polo shirt" → ["short brown hair", "glasses", "blue polo shirt"]
 */
function parseAttributeTerms(description: string): string[] {
  return description
    .split(/[,;\n]+/)
    .map((t) => t.trim().toLowerCase())
    .filter((t) => t.length > 1);
}

/**
 * Score every photo against the attribute terms from the selfie description.
 * Score = matching terms / total terms * 100, with a 1.2x bonus for photos with faces.
 * Returns photos with score >= 30, sorted by confidence descending.
 */
function scoreByText(
  photos: PhotoRecord[],
  terms: string[],
): MatchResult[] {
  if (terms.length === 0) return [];

  const results: MatchResult[] = [];

  for (const photo of photos) {
    const haystack = (photo.peopleDescriptions || "").toLowerCase();
    if (!haystack) continue;

    let matchCount = 0;
    const matched: string[] = [];
    for (const term of terms) {
      if (haystack.includes(term)) {
        matchCount++;
        matched.push(term);
      }
    }

    if (matchCount === 0) continue;

    let score = (matchCount / terms.length) * 100;
    if (photo.faceCount > 0) {
      score *= 1.2;
    }
    score = Math.min(score, 100);

    if (score >= 30) {
      results.push({
        photo,
        confidence: Math.round(score),
        reason: `Text match: ${matched.join(", ")}`,
      });
    }
  }

  results.sort((a, b) => b.confidence - a.confidence);
  return results;
}

// ── Tier 2 helpers ────────────────────────────────────────────────────────

const VISUAL_BATCH_SIZE = 5;
const MAX_VISUAL_CANDIDATES = 30; // 6 batches max

/**
 * Run visual face matching against photos with detected faces.
 * Processes in batches of 5, exits early if 3+ high-confidence matches found.
 */
async function runVisualMatching(
  uploadedImageBase64: string,
  uploadedMimeType: string,
  allPhotos: PhotoRecord[],
  apiKey: string,
): Promise<MatchResult[]> {
  // Build candidate set: only photos with faces, sorted by faceCount descending
  const candidates = allPhotos
    .filter((p) => p.faceCount > 0 && p.driveFileId)
    .sort((a, b) => b.faceCount - a.faceCount)
    .slice(0, MAX_VISUAL_CANDIDATES);

  if (candidates.length === 0) return [];

  const allMatches: MatchResult[] = [];

  for (let i = 0; i < candidates.length; i += VISUAL_BATCH_SIZE) {
    const batch = candidates.slice(i, i + VISUAL_BATCH_SIZE);

    // Fetch thumbnails at w300 (small — sufficient for face matching)
    const images = await Promise.all(
      batch.map(async (photo) => {
        const result = await fetchDriveThumbnail(photo.driveFileId, apiKey);
        if (!result) return null;
        return { id: photo.id, imageBase64: result.base64, mimeType: result.mimeType };
      }),
    );

    const valid = images.filter(
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

    // Early exit: if we have 3+ matches with confidence >= 50, stop processing
    const highConfidence = allMatches.filter((m) => m.confidence >= 50);
    if (highConfidence.length >= 3) break;
  }

  allMatches.sort((a, b) => b.confidence - a.confidence);
  return allMatches;
}

/**
 * Fetch a Drive image at reduced size (w300) for face matching.
 */
async function fetchDriveThumbnail(
  fileId: string,
  apiKey: string,
): Promise<{ base64: string; mimeType: string } | null> {
  try {
    // Use thumbnail link with w300 for smaller downloads
    const url = `https://lh3.googleusercontent.com/d/${fileId}=w300`;
    const res = await fetch(url);
    if (!res.ok) {
      // Fall back to full Drive API if thumbnail endpoint fails
      return fetchDriveImageFull(fileId, apiKey);
    }

    const contentType = res.headers.get("content-type") || "";
    if (!contentType.startsWith("image/")) {
      return fetchDriveImageFull(fileId, apiKey);
    }

    const buffer = await res.arrayBuffer();
    const base64 = Buffer.from(buffer).toString("base64");
    return { base64, mimeType: contentType };
  } catch {
    return fetchDriveImageFull(fileId, apiKey);
  }
}

/**
 * Full-size Drive API fallback for when thumbnail endpoint is unavailable.
 */
async function fetchDriveImageFull(
  fileId: string,
  apiKey: string,
): Promise<{ base64: string; mimeType: string } | null> {
  try {
    const url = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media&key=${apiKey}`;
    const res = await fetch(url);
    if (!res.ok) return null;

    const contentType = res.headers.get("content-type") || "";
    if (!contentType.startsWith("image/")) return null;

    const buffer = await res.arrayBuffer();
    const base64 = Buffer.from(buffer).toString("base64");
    return { base64, mimeType: contentType };
  } catch {
    return null;
  }
}

// ── Merge / dedup ─────────────────────────────────────────────────────────

/**
 * Merge Tier 1 and Tier 2 results, deduplicating by photo id.
 * When both tiers found the same photo, keep the higher confidence.
 */
function mergeResults(
  textMatches: MatchResult[],
  visualMatches: MatchResult[],
): MatchResult[] {
  const byId = new Map<string, MatchResult>();

  for (const m of textMatches) {
    byId.set(m.photo.id, m);
  }

  for (const m of visualMatches) {
    const existing = byId.get(m.photo.id);
    if (!existing || m.confidence > existing.confidence) {
      byId.set(m.photo.id, m);
    }
  }

  const merged = Array.from(byId.values());
  merged.sort((a, b) => b.confidence - a.confidence);
  return merged;
}
