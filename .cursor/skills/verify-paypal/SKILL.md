---
name: verify-paypal
description: "Drive and verify Wholeshare PayPal Developer API and SDK integrations: Orders v2 soft holds, Invoicing v2 QR codes, Subscriptions billing, Shipment Tracking, and timeout/outage resilience."
---

# Verify PayPal Developer API and SDK

This skill provides scripted verification for all PayPal Developer API and SDK capabilities used in Wholeshare. Every check exercises real PayPal Sandbox rails without mocks.

## Launch
Verify that the runtime environment is initialized and dependencies are installed.

```bash
# Verify Node.js runtime and dependencies
node -v
npm list @paypal/agent-toolkit @ai-sdk/openai
```

Ensure `.env` contains valid PayPal Sandbox credentials.

```bash
# Check that sandbox credentials are populated
grep -E "PAYPAL_CLIENT_ID|PAYPAL_CLIENT_SECRET" .env
```

## Doctor
Run the live PayPal Developer doctor check. This exercises an OAuth2 client credentials handshake with api-m.sandbox.paypal.com, validates token issuance, and measures latency.

```bash
node scripts/control-paypal.js doctor
```

Expected output:
```json
{
  "status": "HEALTHY",
  "environment": "sandbox",
  "apiBase": "https://api-m.sandbox.paypal.com",
  "handshakeLatencyMs": 1973,
  "tokenPrefix": "A21AAI-TVzap9fa...",
  "timeoutResilienceEnabled": true,
  "credentialsConfigured": true
}
```

If the doctor returns `UNHEALTHY` or HTTP 401, verify the sandbox credentials in `.env`.

## Drive
Drive individual PayPal Developer capabilities using the verification lever `scripts/control-paypal.js`.

### 1. Orders v2 Soft Holds
Create a real authorization hold with `intent: "AUTHORIZE"`.
```bash
node scripts/control-paypal.js order:authorize --amount 15000 --ref sme_austin_01
```

Query the live order status.
```bash
node scripts/control-paypal.js order:get --order-id <ORDER_ID>
```

### 2. Invoicing v2 Step-Up QR Codes
Generate a draft invoice and QR code URL for high-value step-up KYC verification.
```bash
node scripts/control-paypal.js invoice:qr --amount 144000 --email buyer@wholeshare.local
```

### 3. Subscriptions Clan Billing
Create a recurring clan billing plan on PayPal Subscriptions rails.
```bash
node scripts/control-paypal.js subscription:plan --amount 7500 --name "Weekly Flour Clan"
```

### 4. Carrier Shipment Tracking
Register carrier tracking details for shipment verification and escrow release.
```bash
node scripts/control-paypal.js tracking:register --order-id <ORDER_ID> --tracking 1Z9999999999999999 --carrier UPS
```

### 5. Agent Toolkit Function Calling
List all 47 actions exposed by `@paypal/agent-toolkit/ai-sdk`.
```bash
node scripts/control-paypal.js toolkit:list
```

Execute a live toolkit action on PayPal Sandbox.
```bash
node scripts/control-paypal.js toolkit:execute --tool list_invoices
```

### 6. Timeout and Outage Resilience
Simulate a request timeout and assert graceful HTTP 504 error handling.
```bash
node scripts/control-paypal.js simulate:timeout
```

Simulate an unreachable network host and assert explanatory HTTP 503 diagnostics.
```bash
node scripts/control-paypal.js simulate:outage
```

Simulate an authentication failure and assert HTTP 401 diagnostics with recovery steps.
```bash
node scripts/control-paypal.js simulate:auth-fail
```

## Evidence
Proofs are printed to stdout as JSON records and recorded in test execution artifacts.
- Order authorization proof records `orderId`, `status: "CREATED"`, and `intent: "AUTHORIZE"`.
- Invoice proof records `invoiceId`, `invoiceNumber`, and `qrCodeUrl`.
- Plan proof records `planId`, `status: "ACTIVE"`, and billing interval.
- Resilience proofs record `errorCode: "PAYPAL_TIMEOUT"` (504) or `errorCode: "PAYPAL_NETWORK_ERROR"` (503).
- Proof artifacts survive cleanup and remain accessible in `artifacts/` or `test/` output logs.

## Cleanup
The verification commands are read-only or create draft records in sandbox. No daemon process needs termination.
To reset in-memory OAuth2 token caches between tests:
```bash
node -e 'import("./src/lib/paypal-bridge.js").then(m => m.resetPayPalTokenCache())'
```

## Helpers
The primary verification lever is `scripts/control-paypal.js`.
Full command reference:
```bash
node scripts/control-paypal.js help
```
