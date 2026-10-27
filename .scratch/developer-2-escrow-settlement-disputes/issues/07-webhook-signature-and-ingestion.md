# 07: Webhook Signature Verification & Idempotent Ingestion Module

**What to build:** An internal webhook module that cryptographically validates incoming PayPal notifications, deduplicates events by event ID, and prevents duplicate or out-of-order state transitions.

**Blocked by:** 05a: Thin Sandbox Path: Core Primitives, H2: Public HTTPS Endpoint & Webhook Registration

**Status:** completed

- [x] Implement `src/gateway/paypal-webhook.handler.ts` to verify `PAYPAL-TRANSMISSION-SIG` headers against PayPal's verification service or public certificates.
- [x] Store processed PayPal event IDs in durable storage (`idempotency/processed-events.json`).
- [x] Silently acknowledge and discard duplicate webhook deliveries.
- [x] Safely handle out-of-order deliveries (e.g. capture webhook arriving before order webhook) without corrupting ledger state.
- [x] Output `evidence/04-webhook-verification.json` demonstrating signature verification and rejection of duplicates.

## Verification & Outcomes
- Implemented `src/gateway/paypal-webhook.handler.ts` supporting dual verification: live PayPal API (`POST /v1/notifications/verify-webhook-signature`) and local cryptographic verification (`RSA-SHA256` with CRC-32 & X.509 cert validation).
- Implemented SSRF protection via `isTrustedPayPalCertUrl` ensuring cert URLs must strictly use HTTPS and resolve to PayPal domains.
- Implemented persistent event deduplication in `idempotency/processed-events.json`, silently returning `DUPLICATE_IGNORED` on replays without state mutation.
- Implemented out-of-order event resilience in `idempotency/out-of-order-events.json`, buffering early captures or refunds and safely replaying them once prerequisite authorizations or orders arrive.
- Added comprehensive unit and integration test suite in `test/webhook-verification.test.ts` (13/13 passing, 43/43 total suite passing).
- Generated live PayPal Sandbox evidence in `.scratch/developer-2-escrow-settlement-disputes/evidence/04-webhook-verification.json` verifying live API signature rejection, tamper detection, and deduplication.
- Verified zero-mock policy compliance (`scripts/check-no-mocks.mjs` PASSED).
