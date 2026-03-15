// Tests for exponential backoff retry wrapper.

import { withRetry, RetryableError } from "./retry";

// Speed up tests by using tiny delays
const fastOptions = { baseDelay: 10, maxDelay: 100, maxAttempts: 3 };

describe("withRetry", () => {
  it("returns the result on first success", async () => {
    const fn = jest.fn().mockResolvedValue("ok");
    const result = await withRetry(fn, fastOptions);
    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("retries on 429 and succeeds", async () => {
    const fn = jest
      .fn()
      .mockRejectedValueOnce(new RetryableError("rate limited", 429))
      .mockResolvedValue("ok");

    const result = await withRetry(fn, fastOptions);
    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("retries on 500/502 and succeeds", async () => {
    const fn = jest
      .fn()
      .mockRejectedValueOnce(new RetryableError("server error", 500))
      .mockRejectedValueOnce(new RetryableError("bad gateway", 502))
      .mockResolvedValue("ok");

    const result = await withRetry(fn, fastOptions);
    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("throws after exhausting max attempts", async () => {
    const fn = jest.fn().mockRejectedValue(new RetryableError("always fails", 429));

    await expect(withRetry(fn, fastOptions)).rejects.toThrow("always fails");
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("throws immediately on non-retryable status codes (400, 404)", async () => {
    const fn = jest.fn().mockRejectedValue(new RetryableError("not found", 404));

    await expect(withRetry(fn, fastOptions)).rejects.toThrow("not found");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("throws immediately on non-RetryableError", async () => {
    const fn = jest.fn().mockRejectedValue(new Error("unexpected"));

    await expect(withRetry(fn, fastOptions)).rejects.toThrow("unexpected");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("respects Retry-After header value", async () => {
    const start = Date.now();
    const fn = jest
      .fn()
      .mockRejectedValueOnce(new RetryableError("rate limited", 429, 1))
      .mockResolvedValue("ok");

    await withRetry(fn, { ...fastOptions, baseDelay: 10 });
    const elapsed = Date.now() - start;

    // Should have waited ~1000ms (Retry-After: 1s), not 10ms (baseDelay)
    expect(elapsed).toBeGreaterThanOrEqual(900);
  });
});

describe("RetryableError", () => {
  it("stores status and retryAfter", () => {
    const err = new RetryableError("test", 429, 10);
    expect(err.message).toBe("test");
    expect(err.status).toBe(429);
    expect(err.retryAfter).toBe(10);
    expect(err.name).toBe("RetryableError");
  });

  it("is an instance of Error", () => {
    const err = new RetryableError("test", 500);
    expect(err).toBeInstanceOf(Error);
  });
});
