# 05a: Thin Sandbox Path: Core Primitives

**What to build:** Minimal end-to-end sandbox tracer bullets across four core gateway operations using the exact sandbox fixture numbers, establishing baseline evidence and settling open specification assumptions.

**Blocked by:** 04: Sandbox Buyer Order Approval Script (approve-sandbox-order)

**Status:** completed

- [x] Execute authorization holds for the 4-buyer fixture:
  - Buyer 1: 200 bags ($1,440.00 hold) - Order `39J81892GY6122912`, Authorization `19S92787G0883724A`
  - Buyer 2: 150 bags ($1,080.00 hold) - Order `2R897509EC717374J`
  - Buyer 3: 150 bags ($1,080.00 hold) - Order `34220489RG8462012`
  - Buyer 4 joins: 500 bags ($2,900.00 hold), unlocking Tier 3 ($5.80/bag).
- [x] Execute final capture with `final_capture: true` at the Tier 3 price:
  - Buyer 1: $1,160.00 (against $1,440.00 hold) - Capture `74H63527HK822241U` ($1,160.00 USD, status `COMPLETED`, sellerProtection `ELIGIBLE`).
  - Remaining $280.00 hold balance released automatically when authorization transitioned to `CAPTURED`.
  - Captures money into the platform business account so it is ready for H4.
- [x] Register tracking on captured payments via Orders v2 `POST /v2/checkout/orders/{id}/track`:
  - Registered UPS tracking `1Z9999999999999999` on Order `39J81892GY6122912` producing tracker `74H63527HK822241U-1Z9999999999999999`.
- [x] Execute a partial refund from one captured payment via Payments v2 `POST /v2/payments/captures/{id}/refund`:
  - Partial damage refund `3UL90630A5638033F` for $116.00 USD (20 damaged bags @ $5.80/bag) executed and verified.
- [x] Save evidence files with GET read-backs: `evidence/thin-hold.json`, `evidence/thin-capture.json`, `evidence/thin-tracking.json`, `evidence/thin-refund.json`.
- [x] Update specification `[Unconfirmed]` tags settled by these runs: leftover hold release behavior, Orders v2 tracking response, and partial refund fee retention.
