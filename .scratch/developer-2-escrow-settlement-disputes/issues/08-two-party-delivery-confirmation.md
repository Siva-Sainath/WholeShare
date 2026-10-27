# 08: Two-Party Delivery Confirmation & 48-Hour Inspection Clock

**What to build:** The delivery ingestion layer that records separate supplier and buyer confirmations, triggers the 48-hour inspection countdown at the later confirmation, and auto-confirms delivery after 2 days of buyer silence.

**Blocked by:** 06: Idempotency Pre-Write & Production Final Batch Capture

**Status:** completed

- [x] Create `DeliveryRecord` table tracking `supplierDeliveredAt`, `buyerDeliveredAt`, and `inspectionWindowEndsAt`.
- [x] Implement `POST /api/delivery/confirm` endpoint for supplier and buyer delivery confirmation.
- [x] Enforce single-write rule: each timestamp is written once and cannot be overwritten.
- [x] Compute `inspectionWindowEndsAt` as 48 hours after the later of the two confirmations.
- [x] Implement 2-day auto-confirmation rule: if the buyer stays silent, delivery counts as confirmed 2 days after supplier confirmation, starting the 48-hour window then.
- [x] Update `control-syndicate.mjs simulate-delivery` to fake both confirmations in development/demo mode.
- [x] Register tracking on captured payments via Orders v2 `POST /v2/checkout/orders/{id}/track`.
- [x] Output `evidence/05-delivery-tracking.json` with delivery confirmation timestamps and tracking read-back.

## Execution Details
- Created `src/storage/delivery.storage.ts` with durable `DeliveryRecord` schema (`id`, `clanId`, `memberId`, `trackingNumber`, `carrierName`, `supplierDeliveredAt`, `buyerDeliveredAt`, `inspectionWindowEndsAt`, `source`, `conditionNotes`, `createdAt`).
- Created `src/adapter/delivery.adapter.ts` implementing `confirmDelivery`, `computeInspectionWindow`, and `evaluateAutoConfirmation`.
- Added unit tests in `test/delivery-confirmation.test.ts` (7 passing tests asserting single-write enforcement, inspection countdown math, and 2-day silence rule).
- Updated `control-syndicate.mjs simulate-delivery` command. Successfully transitioned Clan to `FULFILLING` and output `evidence/05-delivery-tracking.json`.
- Zero-mock policy verified clean (`npm run check:mocks`).
