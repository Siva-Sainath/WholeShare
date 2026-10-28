# Feature: External Agent API Ingress with Cryptographic HMAC

External autonomous AI agents submit procurement invoices, purchase orders, and supplier catalogs to Wholeshare over a secured HTTP endpoint. Requests require cryptographic HMAC-SHA256 signatures and timestamp freshness headers to prevent replay attacks and tampering.

## Sub-features
- `hmac-authentication`: Constant-time verification of payload signatures against shared gateway secrets.
- `replay-window-defense`: Strict rejection of requests with timestamps drifting beyond 300 seconds.
- `agent-route-dispatch`: Ingress handling returning HTTP 202 Accepted for downstream processing.

## How to get to it (user POV)
- External AI agents send a signed POST request to `/api/v1/ingest/agent-dispatch`.
- Include `x-wholeshare-signature` and `x-wholeshare-timestamp` in headers.

## Driving it with control-ingestion
Preconditions:
- Gateway secret configured in environment or default test secret.

Step-by-step driving commands:
```bash
node scripts/control-ingestion.js ingest:agent
```

Proof standards:
- Command signs request payload with HMAC-SHA256 and transmits to ingress.
- Output logs authenticated status with status `PROCESSED`.
- Tampered signatures or expired timestamps throw explicit verification errors.

## Gotchas
- Clocks on client agents must synchronize with NTP to avoid timestamp drift rejections.
- The HMAC signature covers the concatenation of timestamp and raw body payload.
