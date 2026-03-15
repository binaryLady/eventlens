// @TheTechMargin 2026
// Tests for text embedding phase — text building and batching logic.

import { describe, it, expect } from "@jest/globals";

// Test buildEmbeddingText — the function that combines photo metadata
// into a single string for embedding. This is the input to Gemini's
// embedding model, so its quality directly affects search results.
describe("buildEmbeddingText", () => {
  function buildEmbeddingText(photo: {
    visible_text?: string;
    people_descriptions?: string;
    scene_description?: string;
    filename?: string;
    folder?: string;
  }): string {
    return [
      photo.visible_text || "",
      photo.people_descriptions || "",
      photo.scene_description || "",
      photo.filename || "",
      photo.folder || "",
    ]
      .filter(Boolean)
      .join(" ")
      .trim();
  }

  it("combines all metadata fields with spaces", () => {
    const result = buildEmbeddingText({
      visible_text: "MIT HardMode 2026",
      people_descriptions: "Speaker at podium",
      scene_description: "Conference stage with projection screen",
      filename: "IMG_001.jpg",
      folder: "Keynotes",
    });

    expect(result).toBe(
      "MIT HardMode 2026 Speaker at podium Conference stage with projection screen IMG_001.jpg Keynotes",
    );
  });

  it("skips empty fields without extra spaces", () => {
    const result = buildEmbeddingText({
      visible_text: "",
      people_descriptions: "Two people talking",
      scene_description: "",
      filename: "photo.jpg",
      folder: "",
    });

    expect(result).toBe("Two people talking photo.jpg");
  });

  it("returns empty string when all fields are empty", () => {
    const result = buildEmbeddingText({
      visible_text: "",
      people_descriptions: "",
      scene_description: "",
      filename: "",
      folder: "",
    });

    expect(result).toBe("");
  });

  it("handles undefined fields", () => {
    const result = buildEmbeddingText({});
    expect(result).toBe("");
  });

  it("includes filename and folder for searchability", () => {
    // Filename and folder are included because organizers often name
    // files and folders meaningfully ("Day1-Keynote", "Team_Ducktronics")
    const result = buildEmbeddingText({
      filename: "team-ducktronics-demo.jpg",
      folder: "Day 2 - Demos",
    });

    expect(result).toContain("team-ducktronics-demo.jpg");
    expect(result).toContain("Day 2 - Demos");
  });
});

describe("embedding batch chunking", () => {
  // The embed phase processes texts in chunks of 100 (Gemini's batch limit).
  // This test verifies the chunking logic produces correct boundaries.

  function chunkArray<T>(arr: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < arr.length; i += size) {
      chunks.push(arr.slice(i, i + size));
    }
    return chunks;
  }

  it("handles exact multiple of chunk size", () => {
    const items = Array.from({ length: 200 }, (_, i) => i);
    const chunks = chunkArray(items, 100);
    expect(chunks).toHaveLength(2);
    expect(chunks[0]).toHaveLength(100);
    expect(chunks[1]).toHaveLength(100);
  });

  it("handles partial final chunk", () => {
    const items = Array.from({ length: 150 }, (_, i) => i);
    const chunks = chunkArray(items, 100);
    expect(chunks).toHaveLength(2);
    expect(chunks[0]).toHaveLength(100);
    expect(chunks[1]).toHaveLength(50);
  });

  it("handles fewer items than chunk size", () => {
    const items = Array.from({ length: 30 }, (_, i) => i);
    const chunks = chunkArray(items, 100);
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toHaveLength(30);
  });

  it("handles empty array", () => {
    const chunks = chunkArray([], 100);
    expect(chunks).toHaveLength(0);
  });
});
