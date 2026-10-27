# 09: In-App Damage Claim Flow & Capped Escrow Refunds

**What to build:** The buyer claim workflow where personal agents collect damage details, code enforces claim caps, the buyer approves the claim, the supplier accepts or counters, and agreed refunds are settled directly from escrow.

**Blocked by:** 08: Two-Party Delivery Confirmation & 48-Hour Inspection Clock, 06: Idempotency Pre-Write & Production Final Batch Capture

**Status:** completed

- [x] Implement personal agent intake collecting damaged unit counts, photos, and descriptions.
- [x] Code enforces deterministic claim cap: `min(damaged_units * unit_price, order_value)`.
- [x] Require explicit buyer (Maria) review and approval before sending claim to supplier.
- [x] Implement supplier response flow: accept, counter-offer, or reject.
- [x] If agreed, call `PayPalMoneyGateway.createRefund` to refund the agreed amount from escrow and reduce the supplier's payout share.
- [x] Enforce single-refund invariant: a claim can never trigger more than one refund.
- [x] Implement CLI commands: `control-syndicate.mjs submit-claim` and `respond-claim`.
- [x] Output `evidence/06-in-app-dispute-refund.json` with read-back of the refund transaction.
