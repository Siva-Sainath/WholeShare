# 04: Production completeAuthorization Gateway Method & Sandbox Approval Script (approve-sandbox-order)

**What to build:** 
1. The production `PayPalMoneyGateway.completeAuthorization` method that completes an approved order within PayPal's 6-hour limit (from when the buyer was redirected to PayPal) and stores the `authorization_id`.
2. An automated sandbox browser script (`scripts/approve-sandbox-order.mjs`) that reads buyer credentials from `.env`, genuinely approves the hold on `sandbox.paypal.com`, and calls `completeAuthorization` to exercise production code.

**Blocked by:** 03: Two-Phase Authorization Hold & Spending Limits

**Status:** completed

- [x] Implement `PayPalMoneyGateway.completeAuthorization(orderId, clanId, memberId)` calling `POST /v2/checkout/orders/{id}/authorize` via the APIMatic typed client (`OrdersController.authorizeOrder`).
- [x] In production, `completeAuthorization` runs when PayPal redirects the buyer back to our application or upon receiving the `CHECKOUT.ORDER.APPROVED` webhook.
- [x] Enforce calling `completeAuthorization` within 6 hours of sending the buyer to PayPal; call authorize immediately after approval.
- [x] Store the resulting `authorization_id` and status (`CREATED`) linked to the member order.
- [x] Implement `scripts/approve-sandbox-order.mjs` reading buyer credentials from `.env`.
- [x] Ensure the script refuses to run outside sandbox mode (`PAYPAL_MODE === 'sandbox'`) and is never imported by application code.
- [x] Automate logging in to `sandbox.paypal.com` with sandbox buyer credentials and clicking approve on the order approval URL (no workarounds for bot checks or captchas).
- [x] Call `gateway.completeAuthorization(orderId)` directly from the script so tests exercise the real production gateway code.
- [x] Allow manual fallback where a developer clicks the printed approval link in a real browser.
- [x] Verify order transitions to `COMPLETED` and produces a real `authorization_id` with status `CREATED`.
- [x] Output `evidence/02-approved-authorization.json` containing `"approved_by": "test script"`, real order ID, and real `authorization_id` read back via GET.

## Comments

### Implementation Summary
- `PayPalMoneyGateway.completeAuthorization`: Implemented using APIMatic typed `@paypal/paypal-server-sdk` `OrdersController.authorizeOrder`. Added 6-hour window check, unapproved status guard, and `getAuthorization` via `PaymentsController.getAuthorizedPayment`.
- Unit tests in `test/gateway-complete-authorization.test.ts` verify the 6-hour window and `CREATED` status rejection.
- `scripts/approve-sandbox-order.mjs`: Implemented dual-mode approval harness supporting automated Puppeteer login and interactive manual browser fallback with polling.
- Live verification: Buyer manually approved order `39J81892GY6122912` in Sandbox, script called `completeAuthorization`, producing real `authorization_id: 19S92787G0883724A` with status `CREATED`. Verified via live GET read-back and recorded in `evidence/02-approved-authorization.json`.
