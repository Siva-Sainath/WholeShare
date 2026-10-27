# 10b: Late Dispute Forwarding & Supplier Repayment Tracking

**What to build:** Workflow for disputes opened after the 48-hour inspection window has expired, forwarding them to PayPal with agent support and tracking supplier repayment obligations under the external supplier agreement.

**Blocked by:** 10a: Formal PayPal Dispute Mediation & Supplier-Approved Offers

**Status:** completed

- [x] Implement late dispute detection for claims opened after the 48-hour window.
- [x] Forward dispute to PayPal with personal agent assistance for the buyer.
- [x] If PayPal rules for the buyer after supplier payout, record a debt repayment record under the external supplier agreement.
- [x] Implement CLI command: `control-syndicate.mjs open-late-dispute`.
- [x] Enforce single-refund invariant: an accepted PayPal dispute refund blocks any second refund from our app.
- [x] Output `evidence/08-late-dispute-forwarding.json`.
