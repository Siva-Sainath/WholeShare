# 0002: PostgreSQL-Only Idempotency and Status Reconciliation

## Context
Network retries, worker restarts, or duplicate webhooks during financial operations (captures, refunds, order creation) can cause double-charging or corrupt ledger states. PayPal's capture endpoint enforces a configured `PayPal-Request-Id` duplicate retention window.

## Decision
We reject Redis in the monetary path and use PostgreSQL as the single source of truth for idempotency.
1. We introduce an `IdempotencyRecord` table tracking deterministic operation keys built strictly from stable business facts: `hash(operation_type:clan_id:member_id:stage:reference)`, where reference is the capture ID or dispute ID. The local database record is retained permanently with no local expiry.
2. All operations follow the write-before-call pattern: insert row as `PENDING`, invoke PayPal with the stable key, record `first_sent_at` (set once, never reset on resend), then record PayPal's reference ID and update to `SUCCEEDED` or `FAILED`.
3. If an operation is found in `PENDING` past the configured PayPal key retention window, the system never resends blindly; it transitions the row to `NEEDS_REVIEW`.
4. A resend that fails while the first request may still be running is treated as "recheck status," never as a failed payment.
5. Buyer-agent payment reports are treated as unverified claims: every reported ID is queried through `PayPalMoneyGateway` before any action. Confirmed duplicate captures escalate to a human manager for refund approval.

## Consequences
- Eliminates volatile cache (Redis) risks in the money path.
- Guarantees crash-safe idempotency tracking with no loss of historical audit data.
- Enforces strict human escalation for duplicate claims and ambiguous external states.
