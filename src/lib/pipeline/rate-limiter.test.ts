// @TheTechMargin 2026
// Tests for sliding-window rate limiter.

import { describe, it, expect } from "@jest/globals";
import { RateLimiter } from "./rate-limiter";

describe("RateLimiter", () => {
  it("allows requests under the limit", async () => {
    const limiter = new RateLimiter(5);
    const start = Date.now();

    // 5 requests should all pass immediately
    for (let i = 0; i < 5; i++) {
      await limiter.waitIfNeeded();
    }

    const elapsed = Date.now() - start;
    // All 5 should complete in under 100ms (no waiting)
    expect(elapsed).toBeLessThan(100);
  });

  it("throttles when limit is exceeded", async () => {
    // Set a very low limit to test throttling behavior
    const limiter = new RateLimiter(2);

    await limiter.waitIfNeeded(); // request 1
    await limiter.waitIfNeeded(); // request 2

    // Request 3 should block until the oldest timestamp ages out of the 60s window.
    // We can't wait 60s in a test, so we race against a short timeout to prove it blocks.
    const start = Date.now();
    const raceResult = await Promise.race([
      limiter.waitIfNeeded().then(() => "completed"),
      new Promise<string>((resolve) => setTimeout(() => resolve("timeout"), 200)),
    ]);
    const elapsed = Date.now() - start;

    // The limiter should still be waiting (60s window), so timeout wins
    expect(raceResult).toBe("timeout");
    // Verify it actually waited the full timeout duration, not returning instantly
    expect(elapsed).toBeGreaterThanOrEqual(180);
  });

  it("creates independent instances", async () => {
    const limiterA = new RateLimiter(1);
    const limiterB = new RateLimiter(1);

    await limiterA.waitIfNeeded();
    // limiterB should not be affected by limiterA's usage
    const start = Date.now();
    await limiterB.waitIfNeeded();
    const elapsed = Date.now() - start;

    expect(elapsed).toBeLessThan(50);
  });
});
