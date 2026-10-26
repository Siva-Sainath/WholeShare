# Feature: Invoicing v2 QR Codes & Step-Up KYC

Automated draft invoice generation and base64 QR code rendering for high-value allocations exceeding the buyer step-up threshold.

## Sub-features
- `draft-invoice-generation`: Creates draft invoices via PayPal Invoicing v2 API.
- `step-up-kyc-qr`: Generates base64 QR codes enabling physical scanning for high-value review.
- `webhook-reconciliation`: Reconciles invoice status changes through PayPal webhook ingress.

## How to get to it (user POV)
- Allocate a quantity that pushes total order value above the buyer step-up threshold.
- The UI displays an amber Step-Up Required badge with an interactive QR modal.

## Driving it with control-syndicate
Preconditions:
- Node.js runtime active.
- Live PayPal Sandbox credentials configured in .env.

Step-by-step driving commands:
```bash
# 1. Generate live Invoicing v2 draft invoice and base64 QR code
node scripts/control-paypal.js invoice:qr --amount 144000 --email buyer@wholeshare.local

# 2. Inspect registered invoicing tools in the agent toolkit
node scripts/control-paypal.js toolkit:execute --tool list_invoices

# 3. Verify step-up threshold enforcement through master syndicate control
node .cursor/skills/verify-syndicate/control-syndicate.mjs lock-escrow --dry-run
```

Proof standards:
- PayPal returns HTTP 201 Created with valid invoice ID starting with INV2.
- QR URL points to sandbox.paypal.com or returns a valid base64 data URI.
- Invoicing records appear in list_invoices output on the live sandbox.

## Gotchas
- Draft invoices do not notify buyers until explicitly sent via the send endpoint.
- QR codes expire if the underlying invoice is cancelled or deleted.
