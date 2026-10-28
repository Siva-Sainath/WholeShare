# Feature: Shipment Tracking Settlement & Escrow Release

Carrier shipment tracking registration and verification that unlocks batch escrow capture upon confirmed carrier transit.

## Sub-features
- `carrier-tracking-registration`: Registers tracking numbers with carrier codes on Orders v2 records.
- `transit-status-verification`: Validates carrier status updates prior to escrow settlement.
- `escrow-capture-trigger`: Executes captureOrderHold when transit verification succeeds.

## How to get to it (user POV)
- Wholesale suppliers access the Supplier Fulfillment portal.
- Enter the shipping carrier and tracking number against the fulfilled syndicate order.

## Driving it with control-syndicate
Preconditions:
- Node.js runtime active.
- Real PayPal Sandbox credentials configured in .env.

Step-by-step driving commands:
```bash
# 1. Register tracking number for an authorized order
node scripts/control-paypal.js tracking:register --order-id 313726450L658723C --tracking 1Z9999999999999999 --carrier UPS

# 2. Query tracking details through the agent toolkit
node scripts/control-paypal.js toolkit:execute --tool get_shipment_tracking

# 3. Verify settlement gating through master syndicate control
node .cursor/skills/verify-syndicate/control-syndicate.mjs lock-escrow --dry-run
```

Proof standards:
- PayPal returns HTTP 201 Created or HTTP 200 OK with tracking status SHIPPED.
- Carrier code maps to recognized logistics providers such as UPS or FEDEX.
- Escrow capture transitions from LOCKED to SETTLED only after tracking registration.

## Gotchas
- Invalid tracking number formats cause PayPal carrier validation errors.
- Tracking cannot be updated once marked as DELIVERED by the carrier.
