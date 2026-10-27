# 11: Per-Member Supplier Payouts & Settlement Integration

**What to build:** Releases each individual bakery's share to the wholesale supplier via PayPal Payouts as their 48-hour inspection window ends with no open dispute, protected by idempotency and covered by reconciliation.

**Blocked by:** 09: In-App Damage Claim Flow & Capped Escrow Refunds, 06: Idempotency Pre-Write & Production Final Batch Capture, 05b: Thin Sandbox Path: Supplier Payout, H3: Enable PayPal Payouts Sandbox Feature

**Status:** completed

- [x] Implement `PayPalMoneyGateway.sendSupplierPayout` executing `POST /v1/payments/payouts` per settled member parcel.
- [x] Record payout operations in `IdempotencyRecord` with type `PAYOUT`.
- [x] Enforce hold rule: a bakery with a claim escalated to PayPal is **not** paid until the dispute is closed.
- [x] Trigger final accounting webhooks to Zapier upon complete Clan settlement.
- [x] Implement CLI command: `control-syndicate.mjs payout-supplier`.
- [x] Output `evidence/09-supplier-payout.json` verifying payout batch ID and item status via GET lookup.
