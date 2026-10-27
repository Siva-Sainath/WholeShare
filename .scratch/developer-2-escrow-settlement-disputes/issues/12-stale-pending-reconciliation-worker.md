# 12: Stale PENDING Reconciliation Worker

**What to build:** Background daemon that safely resolves crashed or interrupted batch operations using `SELECT ... FOR UPDATE SKIP LOCKED` and PayPal GET lookups, preventing duplicate charges without manual admin intervention.

**Blocked by:** 11: Per-Member Supplier Payouts & Settlement Integration, 10a: Formal PayPal Dispute Mediation & Supplier-Approved Offers, 07: Webhook Signature Verification & Idempotent Ingestion Module, 06: Idempotency Pre-Write & Production Final Batch Capture

**Status:** completed
**Labels:** stretch

- [x] Implement `src/daemon/reconciliation.worker.ts` polling stale `PENDING` idempotency records.
- [x] Select rows using `SELECT ... FOR UPDATE SKIP LOCKED` to prevent worker concurrency races.
- [x] Measure safety from immutable `first_sent_at` (never reset on resend).
- [x] Query remote PayPal status via GET endpoints for authorizations, captures, refunds, and payouts before retrying.
- [x] Safely complete interrupted operations using stored keys; transition ambiguous states to `NEEDS_REVIEW`.
- [x] Ingest webhook events as a secondary signal for status lag.
- [x] Build recovery tests killing processes mid-batch and confirming zero duplicate payments.
- [x] Output `evidence/10-reconciliation-recovery.json`.
