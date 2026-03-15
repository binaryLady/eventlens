// @TheTechMargin 2026
// Tests for InsightFace API client — health checks, embedding extraction, auth.

import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import { FaceApiClient } from "./face-api-client";

describe("FaceApiClient", () => {
  const mockFetch = jest.fn() as jest.MockedFunction<typeof fetch>;

  beforeEach(() => {
    jest.resetAllMocks();
    global.fetch = mockFetch;
  });

  describe("constructor", () => {
    it("strips trailing slashes from base URL", () => {
      const client = new FaceApiClient("https://face-api.railway.app///", "secret");
      // Verify by checking health check URL
      mockFetch.mockResolvedValueOnce({ ok: true } as Response);
      client.healthCheck(1, 0);
      expect(mockFetch).toHaveBeenCalledWith(
        "https://face-api.railway.app/health",
        expect.anything(),
      );
    });
  });

  describe("healthCheck", () => {
    it("returns true when service is healthy", async () => {
      mockFetch.mockResolvedValueOnce({ ok: true } as Response);

      const client = new FaceApiClient("https://face-api.railway.app");
      const result = await client.healthCheck(1, 0);

      expect(result).toBe(true);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it("retries on failure and succeeds", async () => {
      mockFetch
        .mockRejectedValueOnce(new Error("ECONNREFUSED"))
        .mockResolvedValueOnce({ ok: true } as Response);

      const client = new FaceApiClient("https://face-api.railway.app");
      const result = await client.healthCheck(2, 10); // 10ms retry delay for fast tests

      expect(result).toBe(true);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it("returns false after exhausting retries", async () => {
      mockFetch.mockRejectedValue(new Error("ECONNREFUSED"));

      const client = new FaceApiClient("https://face-api.railway.app");
      const result = await client.healthCheck(2, 10);

      expect(result).toBe(false);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it("returns false on non-ok response", async () => {
      mockFetch.mockResolvedValue({ ok: false, status: 503 } as Response);

      const client = new FaceApiClient("https://face-api.railway.app");
      const result = await client.healthCheck(1, 0);

      expect(result).toBe(false);
    });
  });

  describe("getEmbeddings", () => {
    it("returns face embeddings with bounding boxes", async () => {
      const fakeEmbedding = Array.from({ length: 512 }, () => Math.random());
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          faces: [
            {
              index: 0,
              embedding: fakeEmbedding,
              bbox: [100, 150, 200, 300],
              det_score: 0.95,
            },
          ],
          count: 1,
        }),
      } as Response);

      const client = new FaceApiClient("https://face-api.railway.app");
      const faces = await client.getEmbeddings("base64imagedata");

      expect(faces).toHaveLength(1);
      expect(faces[0].embedding).toHaveLength(512);
      expect(faces[0].bbox).toEqual([100, 150, 200, 300]);
      expect(faces[0].index).toBe(0);
    });

    it("returns empty array when no faces detected", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ faces: [], count: 0 }),
      } as Response);

      const client = new FaceApiClient("https://face-api.railway.app");
      const faces = await client.getEmbeddings("base64imagedata");

      expect(faces).toHaveLength(0);
    });

    it("throws on API error", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: async () => "Internal Server Error",
      } as Response);

      const client = new FaceApiClient("https://face-api.railway.app");
      await expect(client.getEmbeddings("bad-data")).rejects.toThrow("Face API 500");
    });

    it("includes auth header when secret is configured", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ faces: [], count: 0 }),
      } as Response);

      const client = new FaceApiClient("https://face-api.railway.app", "my-secret");
      await client.getEmbeddings("base64data");

      const callHeaders = (mockFetch.mock.calls[0] as [string, RequestInit])[1].headers as Record<string, string>;
      expect(callHeaders["Authorization"]).toBe("Bearer my-secret");
    });

    it("omits auth header when no secret configured", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ faces: [], count: 0 }),
      } as Response);

      const client = new FaceApiClient("https://face-api.railway.app");
      await client.getEmbeddings("base64data");

      const callHeaders = (mockFetch.mock.calls[0] as [string, RequestInit])[1].headers as Record<string, string>;
      expect(callHeaders["Authorization"]).toBeUndefined();
    });
  });

  describe("multiple faces", () => {
    it("handles photos with multiple faces", async () => {
      const faces = Array.from({ length: 5 }, (_, i) => ({
        index: i,
        embedding: Array.from({ length: 512 }, () => Math.random()),
        bbox: [i * 100, 0, i * 100 + 80, 120],
        det_score: 0.9 - i * 0.05,
      }));

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ faces, count: 5 }),
      } as Response);

      const client = new FaceApiClient("https://face-api.railway.app");
      const result = await client.getEmbeddings("group-photo");

      expect(result).toHaveLength(5);
      // Each face should have its own index
      expect(result.map((f) => f.index)).toEqual([0, 1, 2, 3, 4]);
      // Each embedding should be 512-dim
      result.forEach((f) => expect(f.embedding).toHaveLength(512));
    });
  });
});
