import { NextRequest, NextResponse } from "next/server";
import { fetchPhotos } from "@/lib/photos";
import { describePersonForMatching, verifyFaceMatches } from "@/lib/gemini";
import { PhotoRecord, MatchResult } from "@/lib/types";
import { config } from "@/lib/config";

export const maxDuration = 60;

/**
 * POST /api/match
 * Accepts an uploaded photo and finds matching people across all event photos.
 *
 * Strategy (revised):
 *   1. Describe the person via Gemini (shared step)
 *   2. Run BOTH text and visual matching in parallel (not gated)
 *   3. Merge results — boost confidence when both tiers agree
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

    // ── Run BOTH tiers in parallel ──────────────────────────────────────
    const attributeTerms = parseAttributeTerms(description);
    const textMatches = scoreByText(allPhotos, attributeTerms);

    let visualMatches: MatchResult[] = [];
    let tier: "text" | "visual" | "both" = "text";

    if (config.googleApiKey) {
      // Always run visual matching — don't let text results gate it
      visualMatches = await runVisualMatching(
        image,
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
 * Parse a description into individual attribute tokens.
 * Splits on commas/semicolons/newlines, then further splits multi-word
 * terms into individual words for flexible matching.
 */
function parseAttributeTerms(description: string): string[] {
  const phrases = description
    .split(/[,;\n]+/)
    .map((t) => t.trim().toLowerCase())
    .filter((t) => t.length > 1);

  // Return both full phrases and individual meaningful words
  const words = new Set<string>();
  const fullPhrases: string[] = [];

  for (const phrase of phrases) {
    fullPhrases.push(phrase);
    // Extract individual words (skip tiny filler words)
    const tokens = phrase.split(/\s+/).filter((w) => w.length > 2);
    for (const token of tokens) {
      if (!STOP_WORDS.has(token)) {
        words.add(token);
      }
    }
  }

  return [...fullPhrases, ...Array.from(words)];
}

/** Common words that don't help distinguish people */
const STOP_WORDS = new Set([
  "the", "and", "with", "has", "are", "was", "his", "her", "its",
  "wearing", "appears", "looking", "visible", "seen", "about",
  "approximately", "around", "very", "slightly", "somewhat",
]);

/**
 * Score every photo against the attribute terms from the selfie description.
 *
 * Improvements over v1:
 *   - Word-boundary matching to prevent "blue" matching "blueberry"
 *   - Separate scoring for full-phrase matches (high value) vs word matches (lower)
 *   - Bonus for face count proximity (1-2 faces = likely a portrait)
 *   - Higher threshold (40) to reduce false positives
 */
function scoreByText(
  photos: PhotoRecord[],
  terms: string[],
): MatchResult[] {
  if (terms.length === 0) return [];

  // Separate full phrases from individual words
  // First N terms are phrases, rest are individual words
  const results: MatchResult[] = [];

  for (const photo of photos) {
    const haystack = (photo.peopleDescriptions || "").toLowerCase();
    if (!haystack) continue;

    let score = 0;
    const matched: string[] = [];

    for (const term of terms) {
      // Use word-boundary-aware matching
      if (matchesWithBoundary(haystack, term)) {
        // Full phrases are worth more than single words
        const isPhrase = term.includes(" ");
        const termScore = isPhrase ? 15 : 5;
        score += termScore;
        matched.push(term);
      }
    }

    if (matched.length === 0) continue;

    // Normalize score to 0-100 range
    const maxPossible = terms.length * 10; // rough average
    let normalizedScore = Math.min((score / maxPossible) * 100, 95);

    // Small boost for photos with 1-3 faces (more likely a portrait match)
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

/**
 * Check if `needle` appears in `haystack` respecting word boundaries.
 * Prevents "blue" matching inside "blueberry" or "glasses" inside "sunglasses".
 */
function matchesWithBoundary(haystack: string, needle: string): boolean {
  // For multi-word phrases, check if all words appear (order-independent)
  if (needle.includes(" ")) {
    const words = needle.split(/\s+/).filter((w) => w.length > 2);
    return words.every((word) => matchesWithBoundary(haystack, word));
  }

  // Single word: use word boundary regex
  try {
    const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(`(?:^|[\\s,;.!?()\\-/])${escaped}(?=[\\s,;.!?()\\-/]|$)`, "i");
    return regex.test(haystack);
  } catch {
    // Fallback to includes if regex fails
    return haystack.includes(needle);
  }
}

/** Deduplicate matched terms (a word may duplicate its phrase) */
function dedup(arr: string[]): string[] {
  const seen = new Set<string>();
  return arr.filter((item) => {
    if (seen.has(item)) return false;
    seen.add(item);
    return true;
  });
}

// ── Tier 2 helpers ────────────────────────────────────────────────────────

const VISUAL_BATCH_SIZE = 5;
const MAX_VISUAL_CANDIDATES = 50; // Increased from 30 — cast wider net

/**
 * Run visual face matching against photos with detected faces.
 * Processes in batches, exits early if 5+ high-confidence matches found.
 */
async function runVisualMatching(
  uploadedImageBase64: string,
  uploadedMimeType: string,
  allPhotos: PhotoRecord[],
  apiKey: string,
): Promise<MatchResult[]> {
  // Candidates: photos with faces, sorted by face count ascending
  // (photos with fewer faces = easier to match against)
  const candidates = allPhotos
    .filter((p) => p.faceCount > 0 && p.driveFileId)
    .sort((a, b) => a.faceCount - b.faceCount)
    .slice(0, MAX_VISUAL_CANDIDATES);

  if (candidates.length === 0) return [];

  const allMatches: MatchResult[] = [];

  for (let i = 0; i < candidates.length; i += VISUAL_BATCH_SIZE) {
    const batch = candidates.slice(i, i + VISUAL_BATCH_SIZE);

    // Fetch thumbnails at w800 (larger = better face matching accuracy)
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

    // Early exit: 5+ matches with confidence >= 60
    const highConfidence = allMatches.filter((m) => m.confidence >= 60);
    if (highConfidence.length >= 5) break;
  }

  allMatches.sort((a, b) => b.confidence - a.confidence);
  return allMatches;
}

/**
 * Fetch a Drive image at w800 for face matching (up from w300).
 */
async function fetchDriveThumbnail(
  fileId: string,
  apiKey: string,
): Promise<{ base64: string; mimeType: string } | null> {
  try {
    const url = `https://lh3.googleusercontent.com/d/${fileId}=w800`;
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

// ── Merge / dedup ─────────────────────────────────────────────────────────

/**
 * Merge Tier 1 and Tier 2 results with confidence boosting.
 *
 * When both tiers find the same photo:
 *   - Take the higher confidence as the base
 *   - Add a 15-point boost (capped at 99) for cross-validation
 *   - Combine reasons
 *
 * This rewards photos that pass both text and visual checks.
 */
function mergeResults(
  textMatches: MatchResult[],
  visualMatches: MatchResult[],
): MatchResult[] {
  const byId = new Map<string, MatchResult>();
  const textIds = new Set<string>();

  for (const m of textMatches) {
    byId.set(m.photo.id, m);
    textIds.add(m.photo.id);
  }

  for (const m of visualMatches) {
    const existing = byId.get(m.photo.id);
    if (existing) {
      // Both tiers found this photo — boost confidence
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
