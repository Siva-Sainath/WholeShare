# Feature: AG Grid Live Syndicate & Escrow Ledger

Full-width financial data grid displaying Master-Detail relationships across Clans and member SMEs, featuring cell change flashing and real-time pro-rata calculations.

## Sub-features
- `master-clan-row`: Displays Clan ID, Target SKU, Pooled Volume, Escrow Total, Discount %, and Carrier Tracking.
- `detail-sme-rows`: Expandable child rows displaying SME Name, Pledged Units, Authorized Amount, PayPal Order ID, QR Modal Button, Dispute Status, and Net Captured.
- `cell-change-flash`: Glowing green flash on fund authorization/capture; amber flash on partial refund settlement.
- `paypal-qr-modal`: Dialog rendering the sandbox invoice QR code generated via `generate_invoice_qr_code`.

## How to get to it (user POV)
Occupies the entire bottom half (100% width) of the dashboard (`[data-testid="ag-grid-ledger"]`).

## Driving it with control-syndicate
Preconditions:
- Demo fixtures initialized with active Clans and participating SMEs.

Step-by-step driving commands:
```bash
# Verify financial state and inspect ARIA structure
node .cursor/skills/verify-syndicate/control-syndicate.mjs lock-escrow --clan-id "clan_flour_01" --dry-run false
node .cursor/skills/verify-syndicate/control-syndicate.mjs snapshot --component "ag-grid-ledger"
```

Proof standards:
- Grid accessibility snapshot confirms `role: "grid"` with `activeRows: 1` and `expandedDetailRows: 3`.
- Cell change flash telemetry reports `cellChangeFlashEnabled: true`.
- Master row total reflects pooled units ($3,600.00 escrow total across 3 SME child rows).
- Authorized PayPal orders and generated invoice QR URLs match deterministic fixture hashes.

## Gotchas
- `enableCellChangeFlash={true}` must remain enabled in grid options.
- The master row must be expanded to view child SME authorized amounts.
