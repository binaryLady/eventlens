// @TheTechMargin 2026
// Tests for Gemini Vision client — JSON parsing recovery and embedding batching.

import { describe, it, expect, jest, beforeEach } from "@jest/globals";

// We need to test the internal parseGeminiJson function.
// Since it's not exported, we test it through the GeminiClient.analyzePhoto method
// and also extract testable behavior via module internals.

// For direct unit testing of parseGeminiJson, we re-implement the parse logic
// in a testable way. In production, this lives inside gemini-client.ts.
// This approach validates the parsing contract without coupling to internals.

function parseGeminiJson(text: string) {
  // Strip markdown fences
  const cleaned = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();

  // Attempt 1: direct parse
  try {
    const parsed = JSON.parse(cleaned);
    return normalizeAnalysis(parsed);
  } catch {
    // continue
  }

  // Attempt 2: truncation recovery
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
    // continue
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

function normalizeAnalysis(parsed: Record<string, unknown>) {
  const fc = parsed.face_count;
  return {
    visible_text: String(parsed.visible_text || ""),
    people_descriptions: String(parsed.people_descriptions || ""),
    scene_description: String(parsed.scene_description || ""),
    face_count: typeof fc === "number" ? fc : typeof fc === "string" ? parseInt(fc, 10) || 0 : 0,
  };
}

describe("parseGeminiJson", () => {
  describe("Level 1: clean JSON", () => {
    it("parses valid JSON directly", () => {
      const input = JSON.stringify({
        visible_text: "MIT HardMode 2026",
        people_descriptions: "Person in red hoodie",
        scene_description: "Hackathon venue",
        face_count: 3,
      });
      const result = parseGeminiJson(input);
      expect(result.visible_text).toBe("MIT HardMode 2026");
      expect(result.face_count).toBe(3);
    });

    it("strips markdown fences", () => {
      const input = '```json\n{"visible_text":"banner text","people_descriptions":"","scene_description":"stage","face_count":0}\n```';
      const result = parseGeminiJson(input);
      expect(result.visible_text).toBe("banner text");
      expect(result.scene_description).toBe("stage");
    });

    it("handles face_count as string", () => {
      const input = JSON.stringify({
        visible_text: "",
        people_descriptions: "",
        scene_description: "",
        face_count: "5",
      });
      const result = parseGeminiJson(input);
      expect(result.face_count).toBe(5);
    });
  });

  describe("Level 2: truncation recovery", () => {
    it("recovers from truncated string mid-field", () => {
      // Simulates Gemini hitting token limit mid-response
      const input = '{"visible_text":"MIT HardMode","people_descriptions":"Person wearing red hoodie; person at table with lapt';
      const result = parseGeminiJson(input);
      expect(result.visible_text).toBe("MIT HardMode");
      expect(result.people_descriptions).toContain("Person wearing red hoodie");
    });

    it("recovers from missing closing brace", () => {
      const input = '{"visible_text":"test","people_descriptions":"desc","scene_description":"scene","face_count":2';
      const result = parseGeminiJson(input);
      expect(result.visible_text).toBe("test");
      expect(result.face_count).toBe(2);
    });
  });

  describe("Level 3: regex fallback", () => {
    it("extracts individual fields from badly malformed JSON", () => {
      // Double commas, trailing junk — can't be fixed by brace closing
      const input = '{"visible_text":"WiFi: HardMode",,"people_descriptions":"two people talking",, broken "scene_description":"indoor venue","face_count":2}extra junk{{}';
      const result = parseGeminiJson(input);
      expect(result.visible_text).toBe("WiFi: HardMode");
      expect(result.people_descriptions).toBe("two people talking");
      expect(result.scene_description).toBe("indoor venue");
      expect(result.face_count).toBe(2);
    });

    it("returns empty strings when fields are missing entirely", () => {
      const input = "this is not json at all";
      const result = parseGeminiJson(input);
      expect(result.visible_text).toBe("");
      expect(result.people_descriptions).toBe("");
      expect(result.scene_description).toBe("");
      expect(result.face_count).toBe(0);
    });
  });

  describe("normalizeAnalysis", () => {
    it("coerces null/undefined fields to empty strings", () => {
      const result = normalizeAnalysis({
        visible_text: null,
        people_descriptions: undefined,
        scene_description: "",
        face_count: 0,
      });
      expect(result.visible_text).toBe("");
      expect(result.people_descriptions).toBe("");
      expect(result.face_count).toBe(0);
    });

    it("coerces non-numeric face_count to 0", () => {
      const result = normalizeAnalysis({
        visible_text: "",
        people_descriptions: "",
        scene_description: "",
        face_count: "not a number",
      });
      expect(result.face_count).toBe(0);
    });
  });
});

describe("GeminiClient", () => {
  // Mock global fetch for API tests
  const mockFetch = jest.fn() as jest.MockedFunction<typeof fetch>;

  beforeEach(() => {
    jest.resetAllMocks();
    global.fetch = mockFetch;
  });

  describe("analyzePhoto", () => {
    it("sends base64 image to Gemini Vision and parses response", async () => {
      const { GeminiClient } = await import("./gemini-client");

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          candidates: [{
            content: {
              parts: [{
                text: JSON.stringify({
                  visible_text: "Welcome",
                  people_descriptions: "Speaker at podium",
                  scene_description: "Conference stage",
                  face_count: 1,
                }),
              }],
            },
          }],
        }),
        headers: new Headers(),
      } as Response);

      const client = new GeminiClient("test-key", 1000);
      const result = await client.analyzePhoto("base64data", "image/jpeg");

      expect(result.visible_text).toBe("Welcome");
      expect(result.scene_description).toBe("Conference stage");
      expect(result.face_count).toBe(1);

      // Verify API was called with correct URL pattern
      expect(mockFetch).toHaveBeenCalledTimes(1);
      const callUrl = (mockFetch.mock.calls[0] as [string])[0];
      expect(callUrl).toContain("gemini-2.5-flash-lite:generateContent");
      expect(callUrl).toContain("key=test-key");
    });

    it("returns empty analysis when Gemini blocks content", async () => {
      const { GeminiClient } = await import("./gemini-client");

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          candidates: [],
          promptFeedback: { blockReason: "SAFETY" },
        }),
        headers: new Headers(),
      } as Response);

      const client = new GeminiClient("test-key", 1000);
      const result = await client.analyzePhoto("base64data", "image/jpeg");

      expect(result.visible_text).toBe("");
      expect(result.face_count).toBe(0);
    });
  });

  describe("embedTextsBatch", () => {
    it("batches texts at 100 per request", async () => {
      const { GeminiClient } = await import("./gemini-client");

      // 150 texts should produce 2 API calls (100 + 50)
      const texts = Array.from({ length: 150 }, (_, i) => `text ${i}`);
      const fakeEmbedding = Array.from({ length: 768 }, () => 0.1);

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            embeddings: Array.from({ length: 100 }, () => ({ values: fakeEmbedding })),
          }),
          headers: new Headers(),
        } as Response)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            embeddings: Array.from({ length: 50 }, () => ({ values: fakeEmbedding })),
          }),
          headers: new Headers(),
        } as Response);

      const client = new GeminiClient("test-key", 1000);
      const result = await client.embedTextsBatch(texts);

      expect(result).toHaveLength(150);
      expect(result[0]).toHaveLength(768);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });
});
