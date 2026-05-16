/**
 * Token bucket rate limiter for API request throttling.
 * Uses elapsed time calculation for token refill (no interval timers).
 */

export interface TokenBucketConfig {
  /** Maximum number of tokens the bucket can hold */
  maxTokens: number;
  /** Rate at which tokens are refilled (tokens per second) */
  refillRate: number;
  /** Duration in ms to pause token consumption on HTTP 429 */
  backoffMs: number;
}

export class TokenBucket {
  private tokens: number;
  private readonly maxTokens: number;
  private readonly refillRate: number;
  private readonly backoffMs: number;
  private lastRefillTime: number;
  private backoffUntil: number;

  constructor(config: TokenBucketConfig) {
    this.maxTokens = config.maxTokens;
    this.refillRate = config.refillRate;
    this.backoffMs = config.backoffMs;
    this.tokens = config.maxTokens;
    this.lastRefillTime = Date.now();
    this.backoffUntil = 0;
  }

  /**
   * Waits until a token is available, then consumes it.
   * Respects backoff periods triggered by HTTP 429 responses.
   */
  async acquire(): Promise<void> {
    while (true) {
      const now = Date.now();

      // If in backoff period, wait until it expires
      if (now < this.backoffUntil) {
        const waitTime = this.backoffUntil - now;
        await this.sleep(waitTime);
        continue;
      }

      // Refill tokens based on elapsed time
      this.refill();

      // If a token is available, consume it and return
      if (this.tokens >= 1) {
        this.tokens -= 1;
        return;
      }

      // No token available — calculate wait time until next token
      const timeForOneToken = 1000 / this.refillRate;
      await this.sleep(timeForOneToken);
    }
  }

  /**
   * Triggers a backoff period. Called when an API returns HTTP 429.
   * During backoff, acquire() will wait until the backoff period expires.
   */
  backoff(): void {
    this.backoffUntil = Date.now() + this.backoffMs;
  }

  /**
   * Refills tokens based on elapsed time since last refill.
   * Caps tokens at maxTokens.
   */
  private refill(): void {
    const now = Date.now();
    const elapsed = now - this.lastRefillTime;
    const tokensToAdd = (elapsed / 1000) * this.refillRate;

    if (tokensToAdd > 0) {
      this.tokens = Math.min(this.maxTokens, this.tokens + tokensToAdd);
      this.lastRefillTime = now;
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
