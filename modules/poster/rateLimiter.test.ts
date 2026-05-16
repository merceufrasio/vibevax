import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { TokenBucket, TokenBucketConfig } from "./rateLimiter";

describe("TokenBucket", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("should allow immediate acquisition when tokens are available", async () => {
    const bucket = new TokenBucket({
      maxTokens: 3,
      refillRate: 3,
      backoffMs: 5000,
    });

    // Should resolve immediately since bucket starts full
    const promise = bucket.acquire();
    await vi.runAllTimersAsync();
    await expect(promise).resolves.toBeUndefined();
  });

  it("should allow up to maxTokens acquisitions immediately", async () => {
    const bucket = new TokenBucket({
      maxTokens: 3,
      refillRate: 3,
      backoffMs: 5000,
    });

    // All 3 should resolve immediately
    await bucket.acquire();
    await bucket.acquire();
    await bucket.acquire();
  });

  it("should wait for token refill when bucket is empty", async () => {
    const bucket = new TokenBucket({
      maxTokens: 1,
      refillRate: 1,
      backoffMs: 5000,
    });

    // Consume the only token
    await bucket.acquire();

    // Next acquire should wait ~1 second for refill
    let resolved = false;
    const promise = bucket.acquire().then(() => {
      resolved = true;
    });

    // Not resolved yet
    expect(resolved).toBe(false);

    // Advance time by 1 second (enough for 1 token at rate 1/s)
    await vi.advanceTimersByTimeAsync(1000);
    await promise;
    expect(resolved).toBe(true);
  });

  it("should respect backoff period on 429", async () => {
    const bucket = new TokenBucket({
      maxTokens: 3,
      refillRate: 3,
      backoffMs: 5000,
    });

    // Trigger backoff
    bucket.backoff();

    let resolved = false;
    const promise = bucket.acquire().then(() => {
      resolved = true;
    });

    // Should not resolve before backoff expires
    await vi.advanceTimersByTimeAsync(4000);
    expect(resolved).toBe(false);

    // Should resolve after backoff expires
    await vi.advanceTimersByTimeAsync(1500);
    await promise;
    expect(resolved).toBe(true);
  });

  it("should refill tokens based on elapsed time", async () => {
    const bucket = new TokenBucket({
      maxTokens: 3,
      refillRate: 3,
      backoffMs: 5000,
    });

    // Consume all tokens
    await bucket.acquire();
    await bucket.acquire();
    await bucket.acquire();

    // Advance time by 1 second — should refill 3 tokens (rate is 3/s)
    await vi.advanceTimersByTimeAsync(1000);

    // Should be able to acquire 3 more immediately
    await bucket.acquire();
    await bucket.acquire();
    await bucket.acquire();
  });

  it("should not exceed maxTokens when refilling", async () => {
    const bucket = new TokenBucket({
      maxTokens: 3,
      refillRate: 3,
      backoffMs: 5000,
    });

    // Wait a long time without consuming — tokens should cap at maxTokens
    await vi.advanceTimersByTimeAsync(10000);

    // Should only be able to acquire maxTokens (3)
    await bucket.acquire();
    await bucket.acquire();
    await bucket.acquire();

    // 4th should require waiting
    let resolved = false;
    bucket.acquire().then(() => {
      resolved = true;
    });

    // Not resolved immediately
    expect(resolved).toBe(false);
  });

  it("should work with AniList rate config (90/min)", async () => {
    const bucket = new TokenBucket({
      maxTokens: 90,
      refillRate: 1.5, // 90 per minute = 1.5 per second
      backoffMs: 5000,
    });

    // Should allow 90 immediate acquisitions
    for (let i = 0; i < 90; i++) {
      await bucket.acquire();
    }

    // 91st should wait
    let resolved = false;
    bucket.acquire().then(() => {
      resolved = true;
    });
    expect(resolved).toBe(false);
  });
});
