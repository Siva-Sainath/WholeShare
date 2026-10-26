export class TokenBucketRateLimiter {
  constructor({ capacity = 10, refillRatePerSec = 2, maxConcurrency = Infinity } = {}) {
    this.capacity = capacity;
    this.refillRate = refillRatePerSec;
    this.maxConcurrency = maxConcurrency;
    this.buckets = new Map();
    this.activeInflight = new Map();
  }

  isAllowed(clientId) {
    const active = this.activeInflight.get(clientId) || 0;
    if (active >= this.maxConcurrency) {
      return {
        allowed: false,
        reason: "CONCURRENCY_EXHAUSTED",
        remaining: 0,
        retryAfterSec: 2
      };
    }

    const now = Date.now();
    let bucket = this.buckets.get(clientId);

    if (!bucket) {
      bucket = { tokens: this.capacity, lastRefill: now };
      this.buckets.set(clientId, bucket);
    }

    const elapsedSec = (now - bucket.lastRefill) / 1000;
    bucket.tokens = Math.min(this.capacity, bucket.tokens + (elapsedSec * this.refillRate));
    bucket.lastRefill = now;

    if (bucket.tokens >= 1) {
      bucket.tokens -= 1;
      this.activeInflight.set(clientId, active + 1);
      return {
        allowed: true,
        remaining: Math.floor(bucket.tokens),
        activeInflight: active + 1,
        retryAfterSec: 0
      };
    }

    const retryAfterSec = Math.ceil((1 - bucket.tokens) / this.refillRate);
    return {
      allowed: false,
      reason: "RATE_EXHAUSTED",
      remaining: 0,
      retryAfterSec: Math.max(1, retryAfterSec)
    };
  }

  release(clientId) {
    const active = this.activeInflight.get(clientId) || 0;
    if (active > 0) {
      this.activeInflight.set(clientId, active - 1);
    }
  }

  reset(clientId) {
    if (clientId) {
      this.buckets.delete(clientId);
      this.activeInflight.delete(clientId);
    } else {
      this.buckets.clear();
      this.activeInflight.clear();
    }
  }
}

export const agentRateLimiter = new TokenBucketRateLimiter({
  capacity: 5,
  refillRatePerSec: 0.5,
  maxConcurrency: 2
});

export const apiRateLimiter = new TokenBucketRateLimiter({
  capacity: 30,
  refillRatePerSec: 10,
  maxConcurrency: 20
});
