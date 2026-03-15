// @TheTechMargin 2026
// Tests for retry logic — exponential backoff, jitter, Retry-After, non-retryable errors.

import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import { withRetry, RetryableError } from "./retry";

// Speed up tests by using tiny delays
const fastOptions = { baseDelay: 10, maxDelay: 100, maxAttempts: 3 };

describe("withRetry", () => {
  beforeEach(() => {
    jest.restoreAllMocks();
  });

  it("returns immediately on success", async () => {
    const fn = jest.fn<() => Promise<string>>().mockResolvedValue("ok");
    const result = await withRetry(fn, fastOptions);
    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("retries on 429 (rate limit) and succeeds", async () => {
    const fn = jest.fn<() => Promise<string>>()
      .mockRejectedValueOnce(new RetryableError("rate limited", 429))
      .mockResolvedValue("ok");

    const result = await withRetry(fn, fastOptions);
    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("retries on 500 (server error) and succeeds", async () => {
    const fn = jest.fn<() => Promise<string>>()
      .mockRejectedValueOnce(new RetryableError("server error", 500))
      .mockRejectedValueOnce(new RetryableError("server error", 502))
      .mockResolvedValue("ok");

    const result = await withRetry(fn, fastOptions);
    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("throws after exhausting all attempts", async () => {
    const fn = jest.fn<() => Promise<string>>()
      .mockRejectedValue(new RetryableError("always fails", 429));

    await expect(withRetry(fn, fastOptions)).rejects.toThrow("always fails");
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("does not retry non-retryable status codes", async () => {
    const fn = jest.fn<() => Promise<string>>()
      .mockRejectedValue(new RetryableError("bad request", 400));

    await expect(withRetry(fn, fastOptions)).rejects.toThrow("bad request");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("does not retry non-retryable errors (plain Error)", async () => {
    const fn = jest.fn<() => Promise<string>>()
      .mockRejectedValue(new Error("type error"));

    await expect(withRetry(fn, fastOptions)).rejects.toThrow("type error");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("respects Retry-After header when provided", async () => {
    // Retry-After of 1 second → delay should be ~1000ms, not the calculated backoff
    const start = Date.now();
    const fn = jest.fn<() => Promise<string>>()
      .mockRejectedValueOnce(new RetryableError("rate limited", 429, 1))
      .mockResolvedValue("ok");

    await withRetry(fn, { ...fastOptions, baseDelay: 10 });
    const elapsed = Date.now() - start;

    // Should have waited ~1000ms (Retry-After: 1 second), not 10ms (baseDelay)
    expect(elapsed).toBeGreaterThanOrEqual(900);
  });
});

describe("RetryableError", () => {
  it("preserves status code and retryAfter", () => {
    const err = new RetryableError("test", 429, 30);
    expect(err.message).toBe("test");
    expect(err.status).toBe(429);
    expect(err.retryAfter).toBe(30);
    expect(err.name).toBe("RetryableError");
  });

  it("is an instance of Error", () => {
    const err = new RetryableError("test", 500);
    expect(err).toBeInstanceOf(Error);
  });
});
