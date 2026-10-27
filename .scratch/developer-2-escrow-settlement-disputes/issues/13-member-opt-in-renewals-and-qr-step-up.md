# 13: Member Opt-In Renewals, Reauthorization & QR Step-Up

**What to build:** Advanced lifecycle extensions providing category-based opt-in renewal check-ins, authorization history tracking, real reauthorization refreshing, and high-value QR code invoice step-up.

**Blocked by:** 11: Per-Member Supplier Payouts & Settlement Integration

**Status:** completed
**Labels:** stretch

- [x] Implement automated renewal check-in scheduler using configurable durations (minutes in tests, days in prod).
- [x] Enforce 48-hour opt-out default with automated void sweeper for expired holds.
- [x] Implement reauthorization routine calling `POST /v2/payments/authorizations/{id}/reauthorize` to refresh the 3-day honor period.
- [x] Store authorization ID history in PostgreSQL; ensure captures, voids, reconciliation, and idempotency keys follow the **current ID**.
- [x] Test reauthorization for real against sandbox; mark `[Unconfirmed]` if sandbox cannot prove it (never simulate).
- [x] Implement Invoice QR code step-up flow (`POST /v2/invoicing/invoices/{id}/generate-qr-code`) for orders exceeding $1,000.
- [x] Output `evidence/11-renewals-and-stepup.json` verifying state transitions and QR code generation.
