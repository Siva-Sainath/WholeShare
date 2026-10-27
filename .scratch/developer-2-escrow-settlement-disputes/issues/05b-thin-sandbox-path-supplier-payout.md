# 05b: Thin Sandbox Path: Supplier Payout

**What to build:** Minimal sandbox tracer bullet executing a supplier payout from the platform business account to a sandbox supplier account, validating PayPal Payouts v1 in the sandbox.

**Blocked by:** 05a: Thin Sandbox Path: Core Primitives, H3: Enable PayPal Payouts Sandbox Feature

**Status:** completed

- [x] Implement a minimal gateway call for `POST /v1/payments/payouts` targeting the Sandbox Wholesale Supplier Account email.
- [x] Disburse funds from the platform business balance.
- [x] Verify that PayPal returns a payout batch ID with status `PENDING` or `SUCCESS`.
- [x] Read back the payout status via `GET /v1/payments/payouts/{payout_batch_id}`.
- [x] Update the Payouts `[Unconfirmed]` tag in the specification with findings.
- [x] Output `evidence/thin-payout.json` containing the real payout batch ID and GET read-back details.

## Execution Details
- Executed payout for $464.00 USD targeting `sb-t43fur53471579@business.example.com`.
- Payout batch ID: `4YARQWK7HTLRN` (status: `PENDING`, funding source: `BALANCE`).
- Payout item ID: `KKM5T2R28KG5C`.
- Verified read-back via `GET /v1/payments/payouts/4YARQWK7HTLRN`.
- Recorded live evidence in `evidence/thin-payout.json`.
