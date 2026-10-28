# Feature: API Outage Resilience & Graceful Timeout Handling

Resilience architecture guaranteeing graceful aborts, structured error classifications, and actionable recovery messaging when PayPal endpoints experience outages or latency spikes.

## Sub-features
- `abort-controller-timeouts`: Enforces strict 15-second request timeouts to prevent hung event loops.
- `structured-error-classification`: Maps HTTP errors into distinct PayPalApiError subtypes.
- `explanatory-diagnostics`: Emits recovery steps and status URLs instead of raw stack traces.

## How to get to it (user POV)
- If PayPal experiences downtime, users see a clear notification banner with diagnostic status.
- Transactions pause safely with state persisted in PostgreSQL without silent failures.

## Driving it with control-syndicate
Preconditions:
- Node.js runtime active.
- Network connection active.

Step-by-step driving commands:
```bash
# 1. Simulate API timeout and assert HTTP 504 PAYPAL_TIMEOUT classification
node scripts/control-paypal.js simulate:timeout

# 2. Simulate network outage and assert HTTP 503 PAYPAL_NETWORK_ERROR classification
node scripts/control-paypal.js simulate:outage

# 3. Simulate credential failure and assert HTTP 401 PAYPAL_AUTH_ERROR with debug ID
node scripts/control-paypal.js simulate:auth-fail

# 4. Verify system health doctor via master syndicate control
node .cursor/skills/verify-syndicate/control-syndicate.mjs doctor
```

Proof standards:
- Timeout simulation returns exit code 0 with errorCode PAYPAL_TIMEOUT and status 504.
- Outage simulation returns exit code 0 with recovery link to paypal-status.com.
- Auth failure simulation outputs debug ID and precise instructions to check .env.

## Gotchas
- Retries must be idempotent using PayPal-Request-Id to prevent duplicate charges.
- The 15-second default timeout can be overridden per request when bulk batch operations execute.
