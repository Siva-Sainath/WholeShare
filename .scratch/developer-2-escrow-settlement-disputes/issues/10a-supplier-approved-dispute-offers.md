# 10a: Formal PayPal Dispute Mediation & Supplier-Approved Offers

**What to build:** Fallback mediation through PayPal Customer Disputes v1 where the supplier reviews dispute details and decides the offer amount, and the gateway enforces strict supplier approval and claim cap validation.

**Blocked by:** 09: In-App Damage Claim Flow & Capped Escrow Refunds, 07: Webhook Signature Verification & Idempotent Ingestion Module, H4: Provision Test Dispute in Sandbox Resolution Center

**Status:** completed

- [x] Create `DisputeOfferApproval` table in PostgreSQL.
- [x] Implement `POST /api/disputes/offers/approve` where the supplier reviews dispute details, damage photos, and the capped amount, and approves or declines an offer.
- [x] Implement `PayPalMoneyGateway.submitDisputeOffer` checking PayPal's `response_options` for `MAKE_OFFER` permission.
- [x] Gateway strictly refuses any offer without a valid supplier approval record in `DisputeOfferApproval`.
- [x] Gateway strictly refuses any offer exceeding the buyer's capped claim amount or member payment.
- [x] Implement CLI command: `control-syndicate.mjs approve-dispute-offer`.
- [x] Output `evidence/07-paypal-dispute-offer.json` with read-back of dispute state.
