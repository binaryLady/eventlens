// @TheTechMargin 2026
// Gemini Vision API client for photo analysis and text embeddings.

import { RateLimiter } from "./rate-limiter";
import { withRetry, RetryableError } from "./retry";
import type { GeminiAnalysis } from "./types";

const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/models";

const ANALYZE_PROMPT =
  "Analyze this event photo and return ONLY valid JSON:\n" +
  '{"visible_text":"…","people_descriptions":"…",' +
  '"scene_description":"…","face_count":N}\n' +
  "visible_text = readable text in photo (signs, banners, clothing). " +
  "people_descriptions = semicolon-separated descriptions of people " +
  "(appearance, clothing, activities). " +
  "scene_description = setting, event type, atmosphere, objects. " +
  "face_count = number of distinct faces. Be specific and factual.";

/**
 * Parse Gemini's JSON response with fallback strategies for malformed output.
 * Mirrors the Python _parse_gemini_json robustness.
 */
function parseGeminiJson(text: string): GeminiAnalysis {
  // Strip markdown fences
  let cleaned = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();

  // Attempt 1: direct parse
  try {
    const parsed = JSON.parse(cleaned);
    return normalizeAnalysis(parsed);
  } catch {
    // continue to recovery
  }

  // Attempt 2: truncation recovery — close open structures
  try {
    let recovered = cleaned;
    if ((recovered.match(/"/g) || []).length % 2 !== 0) {
      recovered += '"';
    }
    const openBraces = (recovered.match(/{/g) || []).length;
    const closeBraces = (recovered.match(/}/g) || []).length;
    recovered += "}".repeat(Math.max(0, openBraces - closeBraces));

    const openBrackets = (recovered.match(/\[/g) || []).length;
    const closeBrackets = (recovered.match(/]/g) || []).length;
    recovered += "]".repeat(Math.max(0, openBrackets - closeBrackets));

    const parsed = JSON.parse(recovered);
    return normalizeAnalysis(parsed);
  } catch {
    // continue to regex fallback
  }

  // Attempt 3: regex extraction
  const result: Record<string, string | number> = {};
  for (const field of ["visible_text", "people_descriptions", "scene_description"]) {
    const match = cleaned.match(new RegExp(`"${field}"\\s*:\\s*"((?:[^"\\\\]|\\\\.)*)`, "s"));
    result[field] = match ? match[1] : "";
  }
  const fcMatch = cleaned.match(/"face_count"\s*:\s*(\d+)/);
  result.face_count = fcMatch ? parseInt(fcMatch[1], 10) : 0;

  return normalizeAnalysis(result);
}

function normalizeAnalysis(parsed: Record<string, unknown>): GeminiAnalysis {
  const fc = parsed.face_count;
  return {
    visible_text: String(parsed.visible_text || ""),
    people_descriptions: String(parsed.people_descriptions || ""),
    scene_description: String(parsed.scene_description || ""),
    face_count: typeof fc === "number" ? fc : typeof fc === "string" ? parseInt(fc, 10) || 0 : 0,
  };
}

export class GeminiClient {
  private apiKey: string;
  private limiter: RateLimiter;

  constructor(apiKey: string, rpm = 30) {
    this.apiKey = apiKey;
    this.limiter = new RateLimiter(rpm);
  }

  /**
   * Analyze a photo with Gemini Vision, returning structured metadata.
   */
  async analyzePhoto(base64Image: string, mimeType: string): Promise<GeminiAnalysis> {
    return withRetry(async () => {
      await this.limiter.waitIfNeeded();

      const url = `${GEMINI_BASE}/gemini-2.5-flash-lite:generateContent?key=${this.apiKey}`;
      const body = {
        contents: [
          {
            parts: [
              { text: ANALYZE_PROMPT },
              { inline_data: { mime_type: mimeType, data: base64Image } },
            ],
          },
        ],
        generationConfig: { temperature: 0.1, maxOutputTokens: 8192 },
      };

      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const errText = await res.text();
        const retryAfter = res.headers.get("retry-after");
        throw new RetryableError(
          `Gemini ${res.status}: ${errText.slice(0, 500)}`,
          res.status,
          retryAfter ? parseInt(retryAfter, 10) : undefined,
        );
      }

      const data = await res.json();

      if (data.error) {
        throw new Error(`Gemini error: ${data.error.message || JSON.stringify(data.error)}`);
      }

      const candidates = data.candidates || [];
      if (!candidates.length) {
        const reason = data.promptFeedback?.blockReason || "unknown";
        console.warn(`[gemini] No candidates (reason: ${reason})`);
        return { visible_text: "", people_descriptions: "", scene_description: "", face_count: 0 };
      }

      const text = candidates[0]?.content?.parts?.[0]?.text || "";
      return parseGeminiJson(text);
    });
  }

  /**
   * Generate 768-dim text embeddings for a batch of strings.
   * Gemini supports up to 100 texts per request; this chunks automatically.
   */
  async embedTextsBatch(
    texts: string[],
    model = "gemini-embedding-001",
  ): Promise<number[][]> {
    const url = `${GEMINI_BASE}/${model}:batchEmbedContents?key=${this.apiKey}`;
    const allEmbeddings: number[][] = [];

    for (let i = 0; i < texts.length; i += 100) {
      const chunk = texts.slice(i, i + 100);
      const requests = chunk.map((t) => ({
        model: `models/${model}`,
        content: { parts: [{ text: t }] },
        outputDimensionality: 768,
      }));

      const result = await withRetry(async () => {
        await this.limiter.waitIfNeeded();

        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ requests }),
        });

        if (!res.ok) {
          const errText = await res.text();
          const retryAfter = res.headers.get("retry-after");
          throw new RetryableError(
            `Gemini embed ${res.status}: ${errText.slice(0, 500)}`,
            res.status,
            retryAfter ? parseInt(retryAfter, 10) : undefined,
          );
        }

        return res.json();
      });

      for (const emb of result.embeddings || []) {
        allEmbeddings.push(emb.values);
      }
    }

    return allEmbeddings;
  }
}
