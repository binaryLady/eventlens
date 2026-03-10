// @TheTechMargin 2026
/**
 * IMAGE MATCHING API (FACE SEARCH)
 * 
 * Finds photos with similar faces using:
 * 1. VECTOR/FACE SEARCH: InsightFace embeddings via face-api service (cosine similarity)
 * 2. FALLBACK: Gemini vision + description matching if face-api unavailable
 * 
 * Query: POST /api/match with { image: "base64...", mimeType: "image/jpeg|png|webp|gif" }
 */
import { NextRequest, NextResponse } from "next/server";
import { fetchPhotosWithMetadata } from "@/lib/photos";
import { describePersonForMatching, verifyFaceMatches } from "@/lib/gemini";
import { fetchDriveImage } from "@/lib/drive";
import { PhotoRecord, MatchResult, MatchTier } from "@/lib/types";
import { enrichPhotoDescriptions, saveMatchSession } from "@/lib/supabase";
import { config } from "@/lib/config";

export const maxDuration = 60;

const FACE_API_URL = process.env.FACE_API_URL || "";
const FACE_API_SECRET = process.env.FACE_API_SECRET || "";

export async function POST(request: NextRequest) {
  try {
    const { image, mimeType } = await request.json();
    if (!image || !mimeType) {
      return NextResponse.json({ error: "Missing image or mimeType" }, { status: 400 });
    }

    const ALLOWED_MIME = ["image/jpeg", "image/png", "image/webp", "image/gif"];
    if (!ALLOWED_MIME.includes(mimeType)) {
      return NextResponse.json({ error: "Invalid image type" }, { status: 400 });
    }

    const MAX_BASE64_SIZE = 10 * 1024 * 1024;
    if (typeof image !== "string" || image.length > MAX_BASE64_SIZE) {
      return NextResponse.json({ error: "Image too large" }, { status: 400 });
    }

    if (FACE_API_URL) {
      const vectorResult = await tryVectorMatch(image, mimeType);
      if (vectorResult) return NextResponse.json(vectorResult);
    }

    return geminiMatch(image, mimeType);
  } catch {
    return NextResponse.json(
      { error: "Failed to process photo match" },
      { status: 500 },
    );
  }
}

// ── Vector search path ─────────────────────────────────────────────────

async function tryVectorMatch(
  imageBase64: string,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _mimeType: string,
): Promise<{ matches: MatchResult[]; description: string; tier: string } | null> {
  try {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (FACE_API_SECRET) headers["Authorization"] = `Bearer ${FACE_API_SECRET}`;

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
      saveMatchSession({ tier: "vector", matchCount: 0, topConfidence: null, queryEmbedding: null, matchedPhotoIds: [] });
      return { matches: [], description: "", tier: "vector" };
    }

    const bestFace = embedData.faces.reduce((a, b) => (a.det_score > b.det_score ? a : b));

    const { matchFacesByEmbedding } = await import("@/lib/supabase");
    const faceMatches = await matchFacesByEmbedding(bestFace.embedding, 0.5, 30);
    if (faceMatches.length === 0) return { matches: [], description: "", tier: "vector" };

    const allPhotos = await fetchPhotosWithMetadata();
    const photoByFileId = new Map<string, PhotoRecord>();
    for (const p of allPhotos) photoByFileId.set(p.driveFileId, p);

    const bestByPhoto = new Map<string, { similarity: number; face_index: number }>();
    for (const fm of faceMatches) {
      const existing = bestByPhoto.get(fm.drive_file_id);
      if (!existing || fm.similarity > existing.similarity) {
        bestByPhoto.set(fm.drive_file_id, { similarity: fm.similarity, face_index: fm.face_index });
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
        tier: "vector",
      });
    });

    matches.sort((a, b) => b.confidence - a.confidence);

    // Fire-and-forget: save session with the query embedding for re-matching
    saveMatchSession({
      tier: "vector",
      matchCount: matches.length,
      topConfidence: matches[0]?.confidence ?? null,
      queryEmbedding: bestFace.embedding,
      matchedPhotoIds: matches.map((m) => m.photo.driveFileId),
    });

    return { matches, description: "", tier: "vector" };
  } catch {
    return null;
  }
}

// ── Gemini-based matching ──────────────────────────────────────────────

async function geminiMatch(imageBase64: string, mimeType: string) {
  let description: string;
  try {
    description = await describePersonForMatching(imageBase64, mimeType);
  } catch {
    return NextResponse.json({
      matches: [],
      description: "",
      tier: "text",
      error: "Could not analyze the uploaded image. Please try a different photo — clear, well-lit selfies work best.",
    });
  }

  if (description.includes("NO_PERSON_DETECTED")) {
    return NextResponse.json({
      matches: [],
      description: "",
      tier: "text",
      error: "No person detected in the uploaded photo. Please upload a clear photo of a person.",
    });
  }

  const allPhotos = await fetchPhotosWithMetadata();
  if (allPhotos.length === 0) {
    return NextResponse.json({ matches: [], description, tier: "text", error: "No event photos available yet." });
  }

  const attributeTerms = parseAttributeTerms(description);
  const textMatches = scoreByText(allPhotos, attributeTerms);

  let visualMatches: MatchResult[] = [];
  let tier: MatchTier = "text";

  if (config.googleApiKey) {
    try {
      visualMatches = await runVisualMatching(imageBase64, mimeType, allPhotos, config.googleApiKey);
    } catch {
      // Visual matching failed — continue with text matches only
    }
  }

  if (textMatches.length > 0 && visualMatches.length > 0) tier = "both";
  else if (visualMatches.length > 0) tier = "visual";

  const merged = mergeResults(textMatches, visualMatches);

  // Enrich: write appearance terms to high-confidence visual matches
  // so future text searches benefit (no PII — only attributes)
  if (description && visualMatches.length > 0) {
    enrichMatchedPhotos(description, visualMatches);
  }

  // Fire-and-forget: save session (no embedding available in Gemini path)
  saveMatchSession({
    tier,
    matchCount: merged.length,
    topConfidence: merged[0]?.confidence ?? null,
    queryEmbedding: null,
    matchedPhotoIds: merged.map((m) => m.photo.driveFileId),
  });

  return NextResponse.json({ matches: merged, description, tier });
}

// ── Text matching ──────────────────────────────────────────────────────

const STOP_WORDS = new Set([
  "the", "and", "with", "has", "are", "was", "his", "her", "its",
  "wearing", "appears", "looking", "visible", "seen", "about",
  "approximately", "around", "very", "slightly", "somewhat",
]);

function parseAttributeTerms(description: string): string[] {
  const phrases = description.split(/[,;\n]+/).map((t) => t.trim().toLowerCase()).filter((t) => t.length > 1);
  const words = new Set<string>();
  const fullPhrases: string[] = [];

  for (const phrase of phrases) {
    fullPhrases.push(phrase);
    for (const token of phrase.split(/\s+/).filter((w) => w.length > 2)) {
      if (!STOP_WORDS.has(token)) words.add(token);
    }
  }

  return [...fullPhrases, ...Array.from(words)];
}

function scoreByText(photos: PhotoRecord[], terms: string[]): MatchResult[] {
  if (terms.length === 0) return [];
  const results: MatchResult[] = [];

  for (const photo of photos) {
    const haystack = (photo.peopleDescriptions || "").toLowerCase();
    if (!haystack) continue;

    let score = 0;
    const matched: string[] = [];

    for (const term of terms) {
      if (matchesWithBoundary(haystack, term)) {
        score += term.includes(" ") ? 15 : 5;
        matched.push(term);
      }
    }

    if (matched.length === 0) continue;

    let normalizedScore = Math.min((score / (terms.length * 10)) * 100, 95);
    if (photo.faceCount >= 1 && photo.faceCount <= 3) normalizedScore *= 1.1;
    normalizedScore = Math.min(normalizedScore, 95);

    if (normalizedScore >= 25) {
      results.push({
        photo,
        confidence: Math.round(normalizedScore),
        reason: `Text match: ${Array.from(new Set(matched)).join(", ")}`,
        tier: "text",
      });
    }
  }

  results.sort((a, b) => b.confidence - a.confidence);
  return results;
}

function matchesWithBoundary(haystack: string, needle: string): boolean {
  if (needle.includes(" ")) {
    return needle.split(/\s+/).filter((w) => w.length > 2).every((word) => matchesWithBoundary(haystack, word));
  }
  try {
    const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`(?:^|[\\s,;.!?()\\-/])${escaped}(?=[\\s,;.!?()\\-/]|$)`, "i").test(haystack);
  } catch {
    return haystack.includes(needle);
  }
}

// ── Visual matching ────────────────────────────────────────────────────

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
        const result = await fetchDriveImage(photo.driveFileId, apiKey, 400);
        if (!result) return null;
        return { id: photo.id, imageBase64: result.base64, mimeType: result.mimeType };
      }),
    );

    const valid = images.filter(
      (t): t is { id: string; imageBase64: string; mimeType: string } => t !== null,
    );
    if (valid.length === 0) continue;

    const matches = await verifyFaceMatches(uploadedImageBase64, uploadedMimeType, valid);

    for (const match of matches) {
      const photo = batch.find((p) => p.id === match.id);
      if (photo) allMatches.push({ photo, confidence: match.confidence, reason: match.reason, tier: "visual" });
    }

    if (allMatches.filter((m) => m.confidence >= 60).length >= 5) break;
  }

  allMatches.sort((a, b) => b.confidence - a.confidence);
  return allMatches;
}

function mergeResults(textMatches: MatchResult[], visualMatches: MatchResult[]): MatchResult[] {
  const byId = new Map<string, MatchResult>();
  for (const m of textMatches) byId.set(m.photo.id, m);

  for (const m of visualMatches) {
    const existing = byId.get(m.photo.id);
    if (existing) {
      byId.set(m.photo.id, {
        photo: m.photo,
        confidence: Math.min(Math.max(m.confidence, existing.confidence) + 15, 99),
        reason: `${m.reason} + ${existing.reason}`,
        tier: "both",
      });
    } else {
      byId.set(m.photo.id, m);
    }
  }

  const merged = Array.from(byId.values());
  merged.sort((a, b) => b.confidence - a.confidence);
  return merged;
}

// ── Feedback enrichment ─────────────────────────────────────────────

const ENRICH_CONFIDENCE_THRESHOLD = 60;

/**
 * Fire-and-forget: for high-confidence visual matches, append the
 * person-description attributes to the photo's people_descriptions.
 * This improves future text-based searches without storing PII.
 */
function enrichMatchedPhotos(description: string, visualMatches: MatchResult[]): void {
  const strong = visualMatches.filter((m) => m.confidence >= ENRICH_CONFIDENCE_THRESHOLD);
  if (strong.length === 0) return;

  // Run in background — don't block the response
  Promise.allSettled(
    strong.map((m) => enrichPhotoDescriptions(m.photo.driveFileId, description)),
  ).catch(() => {});
}
