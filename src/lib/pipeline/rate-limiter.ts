// @TheTechMargin 2026
// Sliding-window rate limiter for API calls.

export class RateLimiter {
  private maxPerMinute: number;
  private timestamps: number[] = [];

  constructor(maxPerMinute: number) {
    this.maxPerMinute = maxPerMinute;
  }

  async waitIfNeeded(): Promise<void> {
    const now = Date.now();

    // Prune timestamps older than 60 seconds
    this.timestamps = this.timestamps.filter((t) => t > now - 60_000);

    if (this.timestamps.length >= this.maxPerMinute) {
      const oldestInWindow = this.timestamps[0];
      const sleepMs = 60_000 - (now - oldestInWindow) + 100;
      if (sleepMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, sleepMs));
      }
    }

    this.timestamps.push(Date.now());
  }
}
