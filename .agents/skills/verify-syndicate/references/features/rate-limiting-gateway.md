# Feature: API Rate Limiting & Gateway Throttling

High-performance API rate limiting layer designed to protect PayPal webhook ingresses and agent-to-agent message buses from DDoS, replay attacks, and abusive scraping.

## Sub-features
- `token-bucket-limiter`: Smooth in-memory burst-tolerant rate limiter allowing temporary spikes up to bucket capacity.
- `leaky-bucket-limiter`: Fixed-rate queue smoothing outgoing webhook dispatch to third-party endpoints.
- `sliding-window-limiter`: Redis-backed sliding window log preventing boundary spikes at minute intervals.
- `hmac-replay-firewall`: Timestamp freshness check rejecting requests older than 300 seconds.
- `rate-limit-telemetry`: Header emission (`X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`).

## How to get to it (user POV)
- Applied automatically to all external API endpoints (`/api/sme/spawn`, `/api/webhooks/paypal`, `/api/webhooks/telegram`).
- Telemetry visible in the Judge Bar Security Badges (`[data-testid="security-telemetry-badges"]`).

## Driving it with control-syndicate
Preconditions:
- Application service is running or simulated via control harness.
- Test traffic harness ready to dispatch concurrent requests.

Step-by-step driving commands:
```bash
# Execute comparative rate-limiting benchmark across algorithms
node .cursor/skills/verify-syndicate/control-syndicate.mjs rate-limit \
  --requests 500 \
  --concurrency 50 \
  --limit 100 \
  --window-ms 1000

# Probe gateway behavior under sustained burst
node .cursor/skills/verify-syndicate/control-syndicate.mjs rate-limit \
  --algorithm token-bucket \
  --burst 20
```

Proof standards:
- Benchmark outputs comparative table showing requests processed, rejected (429), p50/p95 latency, and memory footprint.
- Token bucket admits burst traffic up to capacity then strictly rejects excess.
- All rejected responses return HTTP 429 with correct `Retry-After` header.

## Gotchas
- In-memory token bucket does not synchronize across multi-container instances without Redis cluster backing.
- Clock skew between client and server exceeding 300 seconds causes HMAC replay guard to reject valid requests.
