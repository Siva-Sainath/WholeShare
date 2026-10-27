# 03: Two-Phase Authorization Hold & Spending Limits

**What to build:** The buyer authorization hold engine that allows small businesses to reserve order capital using PayPal Orders v2 with authorization intent, enforcing spending policy limits without charging cards upfront.

**Blocked by:** 01: Gateway Configuration, Verification Skill & Anti-Mock Diagnostic Harness, 02: Money Math & State Rules Module

**Status:** completed

- [x] Implement `PayPalMoneyGateway.authorizeHold` calling Orders v2 `POST /v2/checkout/orders` with `intent: "AUTHORIZE"` via the APIMatic typed client.
- [x] Enforce SME spending limits in code: `orderAmount <= max_auto_authorize_usd` and `unitPrice <= quote`.
- [x] Refuse orders exceeding the spending limit (high-value QR step-up is deferred to Ticket 13).
- [x] Implement `control-syndicate.mjs seed-demo` creating Clan records with the 3-buyer sandbox fixture (Buyer 1: 200 bags, Buyer 2: 150 bags, Buyer 3: 150 bags at $7.20/bag).
- [x] Verify orders return status `CREATED` with a valid PayPal approval URL.
- [x] Output `evidence/01-authorize-hold.json` containing real order IDs verified via GET read-back (`status: "CREATED"`).

## Comments

### Implementation Summary
- Built `PayPalMoneyGateway.authorizeHold` in `src/gateway/PayPalMoneyGateway.ts` using the APIMatic typed `@paypal/paypal-server-sdk` `OrdersController`.
- Enforced hard spending limits in code (`unitPrice <= quote` and `orderAmount <= maxAutoAuthorizeUsd`), throwing typed `SpendingLimitExceededError` before touching PayPal. Added 4 unit test assertions in `test/gateway-spending-limits.test.ts`.
- Implemented `control-syndicate.mjs seed-demo` generating 3 real sandbox orders totaling 500 bags ($3,600.00 USD) across Maria's Bakery (200 bags), Golden Crust (150 bags), and Sweet Treats (150 bags).
- Recorded full raw PayPal responses and GET read-backs (`status: "CREATED"`) in `evidence/01-authorize-hold.json` and saved demo clan state to `demo-clan-state.json`.
