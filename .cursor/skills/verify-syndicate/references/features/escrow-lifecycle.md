# Feature: Multiparty Escrow & PayPal Financial Lifecycle

Chained orchestration of PayPal for Business primitives executing soft authorization holds, atomic batch capture upon 100% MOQ unlock, delivery tracking verification, and APIMatic pro-rata dispute refund mediation.

## Sub-features
- `order-authorize-hold`: Places soft hold on member SME funds without deducting capital upfront (`intent: "AUTHORIZE"`).
- `qr-step-up-modal`: Renders human-in-the-loop PayPal invoice QR code for pledges exceeding policy limits ($1,000).
- `atomic-batch-capture`: Simultaneous execution of all authorized payments upon Clan threshold confirmation.
- `shipment-tracking-check`: Carrier tracking integration verifying delivery timestamp before dispute eligibility.
- `apimatic-dispute-refund`: Automated pro-rata damage refund (-$300) mediated via APIMatic typed SDK.

## How to get to it (user POV)
- Triggered automatically when a Clan reaches 100% capacity in the A2A Arena or by clicking Step 3 (Escrow) on the Judge Simulator Bar (`[data-testid="btn-step3-escrow"]`).
- Dispute status is accessed via the Action column in the AG Grid Ledger (`[data-testid="ag-grid-ledger"]`).

## Driving it with control-syndicate
Preconditions:
- Node runtime is active and `doctor` check passes.
- Deterministic demo fixtures seeded (`seed-demo --reset`).
- Clan `clan_flour_01` has reached threshold status (`THRESHOLD_MET`).

Step-by-step driving commands:
```bash
# Execute PayPal Sandbox Order Authorization & Batch Capture
node .cursor/skills/verify-syndicate/control-syndicate.mjs lock-escrow \
  --clan-id "clan_flour_01" \
  --dry-run false

# Simulate carrier delivery and APIMatic pro-rata dispute refund
node .cursor/skills/verify-syndicate/control-syndicate.mjs trigger-dispute \
  --clan-id "clan_flour_01" \
  --damage-pct 25
```

Proof standards:
- Orders list returns 3 authorized order IDs (`ORD-SANDBOX-AUTH-*`).
- `batchCaptureStatus` returns `CAPTURED_BATCH_SETTLED`.
- `paypalCaptureBatchId` is present in stdout.
- Dispute returns `paypalRefundTransactionId` (`TXN-REFUND-PP-99014`) and updates member net captured total.

## Gotchas
- Direct capture without authorization violates the zero-risk escrow invariant and will fail policy validation.
- Pledges above $1,000 must include a generated invoice QR URL for step-up authentication.
- Disputes filed beyond 48 hours from verified delivery timestamp are automatically rejected by carrier policy.
