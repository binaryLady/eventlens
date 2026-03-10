import { NextRequest, NextResponse } from "next/server";
import { fetchPhotosWithMetadata } from "@/lib/photos";
import { describePersonForMatching, verifyFaceMatches } from "@/lib/gemini";
import { PhotoRecord, MatchResult } from "@/lib/types";
import { config } from "@/lib/config";

export const maxDuration = 60;

const FACE_API_URL = process.env.FACE_API_URL || "";
const FACE_API_SECRET = process.env.FACE_API_SECRET || "";

/**
 * POST /api/match
 * Accepts an uploaded photo and finds matching people across all event photos.
 *
 * Strategy:
 *   1. If FACE_API_URL is set → extract embedding via InsightFace service
 *      → vector similarity search in Supabase (sub-second)
 *   2. Fallback → Gemini description + visual matching (slower)
 *
 * Body: { image: string (base64), mimeType: string }
 * Returns: { matches: MatchResult[], description: string, tier: string }
 */
// @TheTechMargin 2026
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

    // Try vector search path first (fast)
    if (FACE_API_URL) {
      const vectorResult = await tryVectorMatch(image, mimeType);
      if (vectorResult) {
        return NextResponse.json(vectorResult);
      }
    }

    // Fallback: Gemini-based matching
    return geminiMatch(image, mimeType);
  } catch (error) {
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

// ── Vector search path (InsightFace + pgvector) ────────────────────────

async function tryVectorMatch(
  imageBase64: string,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  mimeType: string,
): Promise<{ matches: MatchResult[]; description: string; tier: string } | null> {
  try {
    // Get face embedding from Python service
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (FACE_API_SECRET) {
      headers["Authorization"] = `Bearer ${FACE_API_SECRET}`;
    }

    const embedRes = await fetch(`${FACE_API_URL}/embed`, {
      method: "POST",
      headers,
      body: JSON.stringify({ image: imageBase64 }),
    });

    if (!embedRes.ok) return null;

    const embedData: {
      faces: Array<{ embedding: number[]; det_score: number }>;
      count: number;
    } = await embedRes.json();

    if (embedData.count === 0) {
      return {
        matches: [],
        description: "",
        tier: "vector",
      };
    }

    // Use the highest-confidence face embedding
    const bestFace = embedData.faces.reduce((a, b) =>
      a.det_score > b.det_score ? a : b,
    );

    // Vector similarity search in Supabase
    const { matchFacesByEmbedding } = await import("@/lib/supabase");
    const faceMatches = await matchFacesByEmbedding(bestFace.embedding, 0.5, 30);

    if (faceMatches.length === 0) {
      return { matches: [], description: "", tier: "vector" };
    }

    // Load photo data to build full MatchResults
    const allPhotos = await fetchPhotosWithMetadata();
    const photoByFileId = new Map<string, PhotoRecord>();
    for (const p of allPhotos) {
      photoByFileId.set(p.driveFileId, p);
    }

    // Deduplicate by photo (a photo can have multiple face matches)
    const bestByPhoto = new Map<string, { similarity: number; face_index: number }>();
    for (const fm of faceMatches) {
      const existing = bestByPhoto.get(fm.drive_file_id);
      if (!existing || fm.similarity > existing.similarity) {
        bestByPhoto.set(fm.drive_file_id, {
          similarity: fm.similarity,
          face_index: fm.face_index,
        });
      }
    }

    const matches: MatchResult[] = [];
    bestByPhoto.forEach((match, fileId) => {
      const photo = photoByFileId.get(fileId);
      if (!photo) return;

      matches.push({
        photo,
        confidence: Math.round(match.similarity * 100),
        reason: `Face match (vector similarity ${(match.similarity * 100).toFixed(0)}%)`,
      });
    });

    matches.sort((a, b) => b.confidence - a.confidence);

    return { matches, description: "", tier: "vector" };
  } catch (error) {
    console.error("Vector match failed, falling back to Gemini:", error);
    return null;
  }
}

// ── Gemini-based matching (fallback) ───────────────────────────────────

async function geminiMatch(imageBase64: string, mimeType: string) {
  const description = await describePersonForMatching(imageBase64, mimeType);

  if (description.includes("NO_PERSON_DETECTED")) {
    return NextResponse.json({
      matches: [],
      description: "",
      tier: "text",
      error:
        "No person detected in the uploaded photo. Please upload a clear photo of a person.",
    });
  }

  const allPhotos = await fetchPhotosWithMetadata();

  if (allPhotos.length === 0) {
    return NextResponse.json({
      matches: [],
      description,
      tier: "text",
      error: "No event photos available yet.",
    });
  }

  const attributeTerms = parseAttributeTerms(description);
  const textMatches = scoreByText(allPhotos, attributeTerms);

  let visualMatches: MatchResult[] = [];
  let tier: "text" | "visual" | "both" = "text";

  if (config.googleApiKey) {
    visualMatches = await runVisualMatching(
      imageBase64,
      mimeType,
      allPhotos,
      config.googleApiKey,
    );
  }

  if (textMatches.length > 0 && visualMatches.length > 0) {
    tier = "both";
  } else if (visualMatches.length > 0) {
    tier = "visual";
  }

  const merged = mergeResults(textMatches, visualMatches);

  return NextResponse.json({ matches: merged, description, tier });
}

// ── Text matching helpers ──────────────────────────────────────────────

function parseAttributeTerms(description: string): string[] {
  const phrases = description
    .split(/[,;\n]+/)
    .map((t) => t.trim().toLowerCase())
    .filter((t) => t.length > 1);

  const words = new Set<string>();
  const fullPhrases: string[] = [];

  for (const phrase of phrases) {
    fullPhrases.push(phrase);
    const tokens = phrase.split(/\s+/).filter((w) => w.length > 2);
    for (const token of tokens) {
      if (!STOP_WORDS.has(token)) {
        words.add(token);
      }
    }
  }

  return [...fullPhrases, ...Array.from(words)];
}

const STOP_WORDS = new Set([
  "the", "and", "with", "has", "are", "was", "his", "her", "its",
  "wearing", "appears", "looking", "visible", "seen", "about",
  "approximately", "around", "very", "slightly", "somewhat",
]);

function scoreByText(
  photos: PhotoRecord[],
  terms: string[],
): MatchResult[] {
  if (terms.length === 0) return [];

  const results: MatchResult[] = [];

  for (const photo of photos) {
    const haystack = (photo.peopleDescriptions || "").toLowerCase();
    if (!haystack) continue;

    let score = 0;
    const matched: string[] = [];

    for (const term of terms) {
      if (matchesWithBoundary(haystack, term)) {
        const isPhrase = term.includes(" ");
        const termScore = isPhrase ? 15 : 5;
        score += termScore;
        matched.push(term);
      }
    }

    if (matched.length === 0) continue;

    const maxPossible = terms.length * 10;
    let normalizedScore = Math.min((score / maxPossible) * 100, 95);

    if (photo.faceCount >= 1 && photo.faceCount <= 3) {
      normalizedScore *= 1.1;
    }
    normalizedScore = Math.min(normalizedScore, 95);

    if (normalizedScore >= 25) {
      results.push({
        photo,
        confidence: Math.round(normalizedScore),
        reason: `Text match: ${dedup(matched).join(", ")}`,
      });
    }
  }

  results.sort((a, b) => b.confidence - a.confidence);
  return results;
}

function matchesWithBoundary(haystack: string, needle: string): boolean {
  if (needle.includes(" ")) {
    const words = needle.split(/\s+/).filter((w) => w.length > 2);
    return words.every((word) => matchesWithBoundary(haystack, word));
  }

  try {
    const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(`(?:^|[\\s,;.!?()\\-/])${escaped}(?=[\\s,;.!?()\\-/]|$)`, "i");
    return regex.test(haystack);
  } catch {
    return haystack.includes(needle);
  }
}

function dedup(arr: string[]): string[] {
  const seen = new Set<string>();
  return arr.filter((item) => {
    if (seen.has(item)) return false;
    seen.add(item);
    return true;
  });
}

// ── Visual matching (Gemini) ───────────────────────────────────────────

const VISUAL_BATCH_SIZE = 5;
const MAX_VISUAL_CANDIDATES = 20;

async function runVisualMatching(
  uploadedImageBase64: string,
  uploadedMimeType: string,
  allPhotos: PhotoRecord[],
  apiKey: string,
): Promise<MatchResult[]> {
  const withFaces = allPhotos.filter((p) => p.faceCount > 0 && p.driveFileId);
  const candidates = withFaces.length > 0
    ? withFaces.sort((a, b) => a.faceCount - b.faceCount).slice(0, MAX_VISUAL_CANDIDATES)
    : allPhotos.filter((p) => p.driveFileId).slice(0, MAX_VISUAL_CANDIDATES);

  if (candidates.length === 0) return [];

  const allMatches: MatchResult[] = [];

  for (let i = 0; i < candidates.length; i += VISUAL_BATCH_SIZE) {
    const batch = candidates.slice(i, i + VISUAL_BATCH_SIZE);

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

    const highConfidence = allMatches.filter((m) => m.confidence >= 60);
    if (highConfidence.length >= 5) break;
  }

  allMatches.sort((a, b) => b.confidence - a.confidence);
  return allMatches;
}

async function fetchDriveThumbnail(
  fileId: string,
  apiKey: string,
): Promise<{ base64: string; mimeType: string } | null> {
  try {
    const url = `https://lh3.googleusercontent.com/d/${fileId}=w400`;
    const res = await fetch(url);
    if (!res.ok) {
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
    if (existing) {
      const baseConfidence = Math.max(m.confidence, existing.confidence);
      const boostedConfidence = Math.min(baseConfidence + 15, 99);
      byId.set(m.photo.id, {
        photo: m.photo,
        confidence: boostedConfidence,
        reason: `${m.reason} + ${existing.reason}`,
      });
    } else {
      byId.set(m.photo.id, m);
    }
  }

  const merged = Array.from(byId.values());
  merged.sort((a, b) => b.confidence - a.confidence);
  return merged;
}
