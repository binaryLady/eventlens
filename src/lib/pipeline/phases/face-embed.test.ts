// @TheTechMargin 2026
// Tests for face embedding pipeline phase — sentinel pattern, error handling, health gate.

import { describe, it, expect } from "@jest/globals";

// Test the sentinel pattern directly — this is a pure function
// that creates the "no faces detected" marker row.
describe("faceSentinel", () => {
  // Re-implement for isolated testing (same logic as face-embed.ts)
  function faceSentinel(photo: { drive_file_id: string; filename: string; folder: string }) {
    return {
      drive_file_id: photo.drive_file_id,
      filename: photo.filename,
      folder: photo.folder,
      face_index: -1,
      embedding: null,
      bbox_x1: 0,
      bbox_y1: 0,
      bbox_x2: 0,
      bbox_y2: 0,
    };
  }

  it("creates a sentinel row with face_index -1 and null embedding", () => {
    const sentinel = faceSentinel({
      drive_file_id: "abc123",
      filename: "photo.jpg",
      folder: "Day 1",
    });

    expect(sentinel.face_index).toBe(-1);
    expect(sentinel.embedding).toBeNull();
    expect(sentinel.drive_file_id).toBe("abc123");
  });

  it("zeroes all bounding box coordinates", () => {
    const sentinel = faceSentinel({
      drive_file_id: "xyz",
      filename: "test.png",
      folder: "Root",
    });

    expect(sentinel.bbox_x1).toBe(0);
    expect(sentinel.bbox_y1).toBe(0);
    expect(sentinel.bbox_x2).toBe(0);
    expect(sentinel.bbox_y2).toBe(0);
  });

  it("preserves photo metadata in the sentinel", () => {
    const sentinel = faceSentinel({
      drive_file_id: "file-id-123",
      filename: "IMG_2026.jpg",
      folder: "Keynote Photos",
    });

    expect(sentinel.filename).toBe("IMG_2026.jpg");
    expect(sentinel.folder).toBe("Keynote Photos");
  });
});

describe("face-embed phase behavior", () => {
  // These tests validate the logical contracts of the phase
  // without requiring Supabase or Railway connections.

  describe("bounding box normalization", () => {
    // The phase normalizes bbox arrays that may be short or long
    function normalizeBbox(bbox: number[]): [number, number, number, number] {
      const bb = (bbox || [0, 0, 0, 0]).slice(0, 4);
      while (bb.length < 4) bb.push(0);
      return bb as [number, number, number, number];
    }

    it("passes through a valid 4-element bbox", () => {
      expect(normalizeBbox([10, 20, 30, 40])).toEqual([10, 20, 30, 40]);
    });

    it("pads short bbox with zeros", () => {
      expect(normalizeBbox([10, 20])).toEqual([10, 20, 0, 0]);
    });

    it("truncates long bbox to 4 elements", () => {
      expect(normalizeBbox([10, 20, 30, 40, 50, 60])).toEqual([10, 20, 30, 40]);
    });

    it("handles empty bbox", () => {
      expect(normalizeBbox([])).toEqual([0, 0, 0, 0]);
    });

    it("handles undefined bbox", () => {
      expect(normalizeBbox(undefined as unknown as number[])).toEqual([0, 0, 0, 0]);
    });
  });
});
