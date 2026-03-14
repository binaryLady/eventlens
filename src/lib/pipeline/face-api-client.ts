// @TheTechMargin 2026
// InsightFace external API client for face embedding extraction.

import type { FaceEmbeddingData } from "./types";

export class FaceApiClient {
  private baseUrl: string;
  private secret: string;

  constructor(baseUrl: string, secret = "") {
    this.baseUrl = baseUrl.replace(/\/+$/, "");
    this.secret = secret;
  }

  private headers(): Record<string, string> {
    const h: Record<string, string> = { "Content-Type": "application/json" };
    if (this.secret) {
      h["Authorization"] = `Bearer ${this.secret}`;
    }
    return h;
  }

  /**
   * Check if the face API is reachable, retrying for cold starts.
   * Serverless-adapted: 3 attempts with 5s delay (vs Python's 6x10s).
   */
  async healthCheck(retries = 3, retryDelay = 5000): Promise<boolean> {
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        const res = await fetch(`${this.baseUrl}/health`, {
          headers: this.headers(),
          signal: AbortSignal.timeout(10_000),
        });
        if (res.ok) return true;
      } catch {
        // API not ready
      }

      if (attempt < retries) {
        console.warn(`[face-api] Not ready (${attempt}/${retries}), retrying in ${retryDelay / 1000}s...`);
        await new Promise((resolve) => setTimeout(resolve, retryDelay));
      }
    }

    return false;
  }

  /**
   * Get face embeddings and bounding boxes for an image.
   */
  async getEmbeddings(base64Image: string): Promise<FaceEmbeddingData[]> {
    const res = await fetch(`${this.baseUrl}/embed`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({ image: base64Image }),
      signal: AbortSignal.timeout(60_000),
    });

    if (!res.ok) {
      throw new Error(`Face API ${res.status}: ${await res.text()}`);
    }

    const data = await res.json();
    return (data.faces || []) as FaceEmbeddingData[];
  }
}
