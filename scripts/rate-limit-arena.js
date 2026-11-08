#!/usr/bin/env node

/**
 * Wholeshare Rate Limiting Arena & Architectural Prototype
 * Implements principle-exhaust-the-design-space and principle-explain-the-number.
 * Tests 3 distinct rate limiting architectures side-by-side:
 * 1. In-Memory Token Bucket (Smooth, burst-tolerant)
 * 2. Leaky Bucket (Queue-smoothed, constant egress)
 * 3. Sliding Window Log (Boundary-safe, memory intensive)
 */

class TokenBucketLimiter {
  constructor(capacity, refillPerSecond) {
    this.capacity = capacity;
    this.tokens = capacity;
    this.refillRate = refillPerSecond;
    this.lastRefill = Date.now();
  }

  allow() {
    const now = Date.now();
    const elapsed = (now - this.lastRefill) / 1000;
    this.tokens = Math.min(this.capacity, this.tokens + elapsed * this.refillRate);
    this.lastRefill = now;

    if (this.tokens >= 1) {
      this.tokens -= 1;
      return true;
    }
    return false;
  }
}

class LeakyBucketLimiter {
  constructor(capacity, leakPerSecond) {
    this.capacity = capacity;
    this.queueSize = 0;
    this.leakRate = leakPerSecond;
    this.lastLeak = Date.now();
  }

  allow() {
    const now = Date.now();
    const elapsed = (now - this.lastLeak) / 1000;
    const leaked = Math.floor(elapsed * this.leakRate);
    if (leaked > 0) {
      this.queueSize = Math.max(0, this.queueSize - leaked);
      this.lastLeak = now;
    }

    if (this.queueSize < this.capacity) {
      this.queueSize += 1;
      return true;
    }
    return false;
  }
}

class SlidingWindowLimiter {
  constructor(limit, windowMs) {
    this.limit = limit;
    this.windowMs = windowMs;
    this.timestamps = [];
  }

  allow() {
    const now = Date.now();
    const threshold = now - this.windowMs;
    // Evict expired timestamps
    while (this.timestamps.length > 0 && this.timestamps[0] <= threshold) {
      this.timestamps.shift();
    }

    if (this.timestamps.length < this.limit) {
      this.timestamps.push(now);
      return true;
    }
    return false;
  }
}

async function runBenchmark(totalRequests = 1000, limit = 200, windowMs = 1000) {
  console.log(`=== Wholeshare Rate Limiting Arena: 3-Way Architectural Bakeoff ===`);
  console.log(`Parameters: ${totalRequests} total requests | Limit: ${limit} req/sec | Window: ${windowMs}ms\n`);

  const initialMemory = process.memoryUsage().heapUsed;

  // 1. Token Bucket Run
  const tokenBucket = new TokenBucketLimiter(limit, limit);
  let tbAllowed = 0;
  let tbRejected = 0;
  const tbLatencies = [];
  const tbStart = process.hrtime.bigint();

  for (let i = 0; i < totalRequests; i++) {
    const t0 = process.hrtime.bigint();
    const allowed = tokenBucket.allow();
    const t1 = process.hrtime.bigint();
    tbLatencies.push(Number(t1 - t0) / 1000); // microseconds
    if (allowed) tbAllowed++;
    else tbRejected++;
  }
  const tbElapsedNs = Number(process.hrtime.bigint() - tbStart);
  const tbDurationMs = tbElapsedNs / 1_000_000;

  // 2. Leaky Bucket Run
  const leakyBucket = new LeakyBucketLimiter(limit, limit);
  let lbAllowed = 0;
  let lbRejected = 0;
  const lbLatencies = [];
  const lbStart = process.hrtime.bigint();

  for (let i = 0; i < totalRequests; i++) {
    const t0 = process.hrtime.bigint();
    const allowed = leakyBucket.allow();
    const t1 = process.hrtime.bigint();
    lbLatencies.push(Number(t1 - t0) / 1000);
    if (allowed) lbAllowed++;
    else lbRejected++;
  }
  const lbElapsedNs = Number(process.hrtime.bigint() - lbStart);
  const lbDurationMs = lbElapsedNs / 1_000_000;

  // 3. Sliding Window Run
  const slidingWindow = new SlidingWindowLimiter(limit, windowMs);
  let swAllowed = 0;
  let swRejected = 0;
  const swLatencies = [];
  const swStart = process.hrtime.bigint();

  for (let i = 0; i < totalRequests; i++) {
    const t0 = process.hrtime.bigint();
    const allowed = slidingWindow.allow();
    const t1 = process.hrtime.bigint();
    swLatencies.push(Number(t1 - t0) / 1000);
    if (allowed) swAllowed++;
    else swRejected++;
  }
  const swElapsedNs = Number(process.hrtime.bigint() - swStart);
  const swDurationMs = swElapsedNs / 1_000_000;

  const finalMemory = process.memoryUsage().heapUsed;
  const memoryDeltaKb = Math.round((finalMemory - initialMemory) / 1024);

  function calculatePercentiles(arr) {
    const sorted = [...arr].sort((a, b) => a - b);
    return {
      p50: sorted[Math.floor(sorted.length * 0.5)].toFixed(2),
      p95: sorted[Math.floor(sorted.length * 0.95)].toFixed(2),
      p99: sorted[Math.floor(sorted.length * 0.99)].toFixed(2)
    };
  }

  const tbP = calculatePercentiles(tbLatencies);
  const lbP = calculatePercentiles(lbLatencies);
  const swP = calculatePercentiles(swLatencies);

  const results = [
    {
      Architecture: 'Token Bucket',
      'Total Requests': totalRequests,
      'Allowed (200)': tbAllowed,
      'Throttled (429)': tbRejected,
      'Exec Time (ms)': tbDurationMs.toFixed(2),
      'Throughput (req/s)': Math.round((totalRequests / tbDurationMs) * 1000),
      'p50 Latency (µs)': tbP.p50,
      'p95 Latency (µs)': tbP.p95,
      'p99 Latency (µs)': tbP.p99,
      Tradeoff: 'Best for API endpoints needing instant burst allowance'
    },
    {
      Architecture: 'Leaky Bucket',
      'Total Requests': totalRequests,
      'Allowed (200)': lbAllowed,
      'Throttled (429)': lbRejected,
      'Exec Time (ms)': lbDurationMs.toFixed(2),
      'Throughput (req/s)': Math.round((totalRequests / lbDurationMs) * 1000),
      'p50 Latency (µs)': lbP.p50,
      'p95 Latency (µs)': lbP.p95,
      'p99 Latency (µs)': lbP.p99,
      Tradeoff: 'Best for outgoing webhooks needing steady fixed rate'
    },
    {
      Architecture: 'Sliding Window Log',
      'Total Requests': totalRequests,
      'Allowed (200)': swAllowed,
      'Throttled (429)': swRejected,
      'Exec Time (ms)': swDurationMs.toFixed(2),
      'Throughput (req/s)': Math.round((totalRequests / swDurationMs) * 1000),
      'p50 Latency (µs)': swP.p50,
      'p95 Latency (µs)': swP.p95,
      'p99 Latency (µs)': swP.p99,
      Tradeoff: 'Strict boundary precision, highest memory footprint'
    }
  ];

  console.table(results);

  console.log(`\n=== Explaining the Numbers (principle-explain-the-number) ===`);
  console.log(`1. Limiter: Node.js V8 execution loop overhead; in-memory Token Bucket achieved ${Math.round((totalRequests / tbDurationMs) * 1000)} req/s.`);
  console.log(`2. Latency spread: Token Bucket p50 is ${tbP.p50} µs vs Sliding Window p50 ${swP.p50} µs.`);
  console.log(`3. Architectural Decision: We recommend Token Bucket for internal A2A event bus and Sliding Window with Redis for external PayPal webhook security.`);
  console.log(`4. Heap footprint delta: ${memoryDeltaKb} KB.`);
}

const reqCount = parseInt(process.argv[2], 10) || 1000;
runBenchmark(reqCount);
