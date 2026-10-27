# 0011: Two-Party Delivery Confirmation and Inspection Window Trigger

> **Status**: Accepted (Supersedes [ADR-0006](0006-carrier-delivery-source-and-tracking-separation.md))

## Context
ADR-0006 proposed relying on an independent delivery-source adapter (carrier tracking events) to establish `carrierDeliveredAt`. However, commercial carrier APIs require merchant shipping accounts that are unavailable in multi-drop B2B syndicates where the wholesale supplier handles their own private freight. Furthermore, carrier tracking statuses on PayPal reflect only merchant-uploaded claims and do not prove delivery time.

## Decision
1. **Two-Party Confirmation Model**: Delivery confirmation is established by the two economic parties involved:
   - The supplier confirms delivery (`supplierDeliveredAt`).
   - The buyer confirms delivery (`buyerDeliveredAt`).
2. **Inspection Window Computation**: The 48-hour inspection countdown starts at the **later of the two confirmations**.
3. **Automatic Confirmation Rule**: If the buyer remains silent following the supplier's delivery confirmation, delivery counts as confirmed **2 days** after the supplier's confirmation, and the 48-hour inspection window begins then.
4. **Data Model**: `DeliveryRecord` tracks `supplierDeliveredAt`, `buyerDeliveredAt`, and `inspectionWindowEndsAt`. Allowed source values: `supplier`, `buyer`, `auto_confirmed`, and `simulated`. Each timestamp is written once and cannot be overwritten.
5. **Confirmation Endpoint**: A dedicated endpoint (`POST /api/delivery/confirm`) is exposed for suppliers and buyer agents to submit delivery confirmations.
6. **Local Simulation**: `control-syndicate.mjs simulate-delivery` fakes both the supplier's and the buyer's delivery confirmations in development and demo environments.

## Consequences
- Eliminates dependency on external third-party carrier APIs.
- Protects buyers from premature countdown triggers while protecting suppliers from buyer silence after 2 days.
- Separates parcel tracking registration on PayPal (for seller protection) from the inspection clock trigger.
