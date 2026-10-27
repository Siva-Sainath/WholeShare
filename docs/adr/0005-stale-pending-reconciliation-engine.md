# 0005: Stale PENDING Reconciliation Engine via FOR UPDATE SKIP LOCKED

## Context
When batch captures, voids, or refunds are interrupted by server crashes or network failures, idempotency rows can linger in a `PENDING` state. Blindly retrying mutations without verifying remote state risks duplicate operations, while abandoning them leaves customer funds in limbo.

## Decision
We implement a dedicated reconciliation worker executing against `IdempotencyRecord`:
1. **Concurrency Protection**: Stale `PENDING` rows (older than a scan delay of 10 minutes) are selected using `SELECT ... FOR UPDATE SKIP LOCKED` so concurrent workers cannot double-process a row.
2. **First-Sent-At Invariant**: The `first_sent_at` timestamp is set once on initial request dispatch and is never reset on resends. The retention window is strictly measured from `first_sent_at`.
3. **Safe State Reconciliation**:
   - Query PayPal's `GET /v2/payments/authorizations/{id}` (or capture/refund GET endpoints).
   - If `CAPTURED`: Mark `SUCCEEDED` with the returned capture ID.
   - If `CREATED` and within the retention window: Resend with the original operation key.
   - If `CREATED` and outside the retention window: Mark `NEEDS_REVIEW`.
   - If `VOIDED` or `DENIED`: Mark `FAILED` and raise a high-priority alert.
   - If `PARTIALLY_CAPTURED`: Mark `NEEDS_REVIEW`.
   - If `PENDING`: Recheck on next scan, transitioning to `NEEDS_REVIEW` after a configured scan cap.
4. **No Autonomous Repayment**: Recovery never creates a new payment or generates a new key. Missing remote records automatically transition to `NEEDS_REVIEW`.

## Consequences
- Guarantees safe batch self-healing across worker restarts.
- Requires database transaction locking discipline (`FOR UPDATE SKIP LOCKED`).
- Requires human operator alerting for `NEEDS_REVIEW` and `FAILED` terminal states.
