# SyndicatePay — Escrow, Payments & Settlement (Developer 2 Context)

This context manages the multi-party escrow lifecycle, automated PayPal transactions, carrier fulfillment synchronization, and dispute mediation.

## Language

### Escrow & Lifecycle

**Authorization Hold**:
A temporary freeze placed on a buyer's funds via PayPal Orders v2 with authorization intent, guaranteeing funds without immediate deduction.
_Avoid_: Charge, deposit, upfront payment

**Final Capture**:
A capture transaction executed with the `final_capture: true` flag set, which collects the final unlocked tier price and signals to PayPal that no further captures will occur against this authorization.
_Avoid_: Full capture, partial debit

**Batch Capture**:
The sequential execution of final capture across all authorized Clan members once the Clan enters the locked state.
_Avoid_: Bulk checkout, mass payment, pooled charge

**Member Opt-In Renewal**:
A scheduled check-in sent to Clan members at day X (varying by order type: 5, 7, 10, or 12 days) prompting them to either maintain their authorization hold or opt out and release their credit line.
_Avoid_: Re-authorization, contract extension

**Escrow Record**:
An immutable record linking a collective Clan fulfillment to its underlying PayPal authorization and capture identifiers.
_Avoid_: Holding account, wallet balance

### Idempotency & Gateway

**Idempotency Record**:
A durable PostgreSQL ledger record with no local expiration, storing a deterministic operation key (`hash(operation_type:clan_id:member_id:stage:reference)`), status (`PENDING`, `SUCCEEDED`, `FAILED`, `NEEDS_REVIEW`), `first_sent_at` timestamp, and PayPal reference identifiers to guarantee exactly-once financial mutation.
_Avoid_: Request cache, dedup token

**Money Gateway**:
The centralized application gateway through which all financial mutations and PayPal interactions must execute, enforcing idempotency pre-writes, Zod boundary validation, and token management.
_Avoid_: API client, HTTP helper

**Reconciliation Worker**:
A background daemon that scans stale `PENDING` idempotency records using `FOR UPDATE SKIP LOCKED` and reconciles their actual status against PayPal's ledger before attempting safe retries or escalating to `NEEDS_REVIEW`.
_Avoid_: Retry loop, polling script

**Buyer-Agent Payment Report**:
A diagnostic claim submitted by a buyer's agent reporting possible duplicate requests or payment history, treated strictly as an unverified claim that must be queried against PayPal before any action is taken.
_Avoid_: User refund request, duplicate command

### Disputes & Fulfillment

**Carrier Delivery Event**:
An independent, verified signal provided by a delivery-source adapter that establishes the immutable `carrierDeliveredAt` timestamp (under either `DELIVERED` or `DAMAGED_IN_TRANSIT` conditions), which alone triggers the 48-hour inspection clock.
_Avoid_: Supplier tracking upload, PayPal tracker delivery

**Dispute Case**:
A formal damaged or missing delivery claim managed through PayPal Customer Disputes v1 with carrier delivery verification and photographic proof.
_Avoid_: Support ticket, complaint, refund request

**Arbitration Review**:
An internal frozen case state where funds are protected while a human manager evaluates damaged-unit claims, photographic hash flags, and carrier delivery records before any offer is submitted.
_Avoid_: Automatic refund, AI settlement

**Inquiry Stage**:
The preliminary phase of a PayPal dispute where the buyer and merchant can negotiate settlement offers directly before escalating to a formal PayPal claim.
_Avoid_: Open dispute, court phase

**Settlement**:
The final state where captured funds are released to the wholesale supplier and accounting webhooks are dispatched.
_Avoid_: Payout, disbursement transfer
