# 0006: Carrier Delivery Source and Tracking Separation

> **Status**: Superseded by [ADR-0011](0011-two-party-delivery-confirmation-and-inspection-window.md)

## Context
PayPal's shipping tracker endpoints (`POST /v2/checkout/orders/{id}/track`) reflect supplier-uploaded shipment details and do not contain authoritative, independent delivery event timestamps. The `DELIVERED` status on PayPal trackers indicates only that the merchant marked it delivered at upload time. Relying on PayPal tracker status or the server clock to trigger the 48-hour inspection window allows dishonest suppliers to prematurely expire buyer inspection rights.

## Decision
*(Superseded by ADR-0011: Replaced carrier-adapter requirement with two-party confirmation: supplierDeliveredAt + buyerDeliveredAt, with a 2-day silence auto-confirmation rule).*

1. **Decoupled Delivery Source**: The 48-hour dispute inspection window is triggered exclusively by delivery confirmation events, never from the supplier's PayPal tracker submission alone or local server time.
2. **Single-Write Guarantee**: Delivery timestamps are written once. The first valid report wins and cannot be overwritten.
3. **Tracking Registration**: Orders v2 `POST /v2/checkout/orders/{id}/track` with `capture_id` is used solely to register tracking numbers on captured orders for seller protection and buyer visibility. The deprecated `/v1/shipping/trackers-batch` endpoint is forbidden.
4. **Hackathon Harness**: A delivery simulation emitter is exposed via `control-syndicate.mjs` for deterministic testing and demo scenarios.

## Consequences
- Requires tracking supplier and buyer delivery confirmation timestamps.
- Orders v2 tracking registration remains dedicated to PayPal seller protection.
