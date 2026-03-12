// @TheTechMargin 2026
// Exponential backoff retry wrapper replacing Python's tenacity.

export interface RetryOptions {
  maxAttempts?: number;
  baseDelay?: number;
  maxDelay?: number;
  retryableStatuses?: number[];
}

export class RetryableError extends Error {
  status: number;
  retryAfter?: number;

  constructor(message: string, status: number, retryAfter?: number) {
    super(message);
    this.name = "RetryableError";
    this.status = status;
    this.retryAfter = retryAfter;
  }
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  options?: RetryOptions,
): Promise<T> {
  const maxAttempts = options?.maxAttempts ?? 3;
  const baseDelay = options?.baseDelay ?? 2000;
  const maxDelay = options?.maxDelay ?? 60_000;
  const retryableStatuses = options?.retryableStatuses ?? [429, 500, 502, 503];

  let lastError: Error | undefined;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));

      if (err instanceof RetryableError) {
        if (!retryableStatuses.includes(err.status)) {
          throw err;
        }

        if (attempt === maxAttempts - 1) break;

        // Use Retry-After header if available, otherwise exponential backoff
        let delay: number;
        if (err.retryAfter && err.retryAfter > 0) {
          delay = err.retryAfter * 1000;
        } else {
          delay = Math.min(baseDelay * Math.pow(2, attempt), maxDelay);
          // Add jitter: +/- 25%
          delay += delay * (Math.random() * 0.5 - 0.25);
        }

        console.warn(
          `[retry] Attempt ${attempt + 1}/${maxAttempts} failed (${err.status}), retrying in ${Math.round(delay)}ms`,
        );
        await new Promise((resolve) => setTimeout(resolve, delay));
      } else {
        // Non-retryable error
        throw err;
      }
    }
  }

  throw lastError || new Error("withRetry exhausted all attempts");
}
