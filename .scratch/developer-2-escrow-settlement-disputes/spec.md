# Spec: Developer 2 — Escrow, Idempotency, Settlement, and Dispute Architecture

Status: ready-for-agent
Triage: ready-for-agent

## Problem Statement

Small and Medium Enterprises (SMEs), such as independent bakeries and specialty coffee roasters, pay a 30% to 50% price penalty when purchasing raw materials because they buy small quantities and lack the purchasing scale to reach wholesale Minimum Order Quantity (MOQ) discount tiers. When small businesses attempt to pool orders informally, coordination breaks down due to payment collection friction, counterparty default risk, and fear that damaged goods delivered to one member will freeze the entire group's funds.

Small businesses need a trustworthy mechanism where funds are held safely until bulk thresholds are reached and goods arrive in good condition. However, running an escrow service in production requires formal approval: PayPal's Acceptable Use Policy lists escrow services among activities requiring pre-approval [Confirmed; unconfirmed legal question regarding external money-transmitter licensing]. For the hackathon, the system operates in the PayPal Sandbox using test accounts and simulated capital.

## Solution

SyndicatePay provides an autonomous multi-party escrow, settlement, and dispute mediation platform built natively on PayPal for Business. For Developer 2's domain, the platform introduces:

1. **Two-Phase Authorization Escrow:** Authorization holds remain on the buyer's side via PayPal Orders v2 (`intent: "AUTHORIZE"`) while the Clan forms. No money moves until the Clan locks. After capture, funds sit in our PayPal business account as escrow until each individual bakery's checking period ends, and only then is the supplier paid that bakery's share.
2. **Category-Based Member Opt-In Renewals:** Instead of a rigid global timeout, members receive scheduled opt-in check-ins based on order type (5, 7, 10, or 12 days) with a 48-hour opt-out default, keeping buyer credit lines free while accommodating different wholesale buying tempos.
3. **One-Shot Final Capture at Discounted Tiers:** When a Clan locks, the platform captures the final unlocked tier price once using the `final_capture: true` flag. This avoids credit card refund churn and unreturned PayPal processing fees, and is intended to release any uncaptured hold balance [Unconfirmed; confirm in sandbox].
4. **PostgreSQL-Only Monetary Idempotency with Status Reconciliation:** Every financial mutation writes an `IdempotencyRecord` as `PENDING` with a deterministic business key (`hash(operation_type:clan_id:member_id:stage:reference)`) before calling PayPal. A background reconciliation daemon uses `SELECT ... FOR UPDATE SKIP LOCKED` and checks remote status before safely retrying crashed batches or escalating stale requests to `NEEDS_REVIEW`.
5. **Two-Party Delivery Confirmation and Inspection Window:** Delivery is confirmed by both the supplier (`supplierDeliveredAt`) and the buyer (`buyerDeliveredAt`). The 48-hour inspection countdown starts at the later of the two confirmations. If the buyer remains silent, delivery counts as confirmed 2 days after the supplier's confirmation, and the 48-hour window begins then.
6. **In-App Dispute Settlement with PayPal Dispute Fallback:** Small damage claims within the 48-hour window are collected by personal agents, mathematically capped by code (`min(damaged_units * unit_price, order_value)`), reviewed and approved by the buyer, and negotiated directly with the supplier. If accepted, the buyer is refunded from escrow and the supplier payout is reduced. If rejected, the claim falls back to a formal PayPal Customer Dispute.
7. **Supplier-Approved PayPal Dispute Offers:** The wholesale supplier decides the amount of any offer our platform account sends to the buyer in a formal PayPal dispute. The gateway executes `submitDisputeOffer` only after the supplier has reviewed the dispute details and approved a specific amount via the supplier approval interface. If accepted before payout, the amount is deducted from that bakery's share; if after payout, the supplier repays us under the external supplier agreement.
8. **Late Dispute Handling:** A dispute opened after the 48-hour window is forwarded to PayPal, where our agent assists the buyer. Under the supplier agreement (outside the app), the supplier must repay us if PayPal rules for the buyer after payout. Exactly one refund path is ever used per claim.
9. **Per-Member Settlement via PayPal Payouts:** As each individual bakery's 48-hour inspection window ends with no open dispute, the platform releases that bakery's share to the wholesale supplier using PayPal Payouts (`sendSupplierPayout`).
10. **Signature-Verified PayPal Webhook Module:** An internal webhook module verifies PayPal's cryptographic signature through the gateway and handles duplicate or out-of-order messages safely.

---

## User Stories

### Escrow & Authorization Lifecycle
1. As a small bakery owner (buyer), I want to place an authorization hold instead of paying upfront, so that my bank account is not charged until the group hits its bulk discount goal.
2. As a buyer, I want my authorization hold to automatically reflect my custom spending limits, so that the system never authorizes charges higher than what I approved.
3. As a buyer with high-value orders (> $1,000), I want to authenticate the hold by scanning a PayPal Invoice Quick Response (QR) code, so that high-risk commitments receive my explicit human authorization.
4. As a buyer purchasing fast commodities (flour/coffee), I want an opt-in renewal check-in at day 5, so that I can cancel my pledge and free my credit line if the pool forms too slowly.
5. As a buyer purchasing seasonal or custom packaging, I want an extended check-in window (up to 12 days), so that slower-forming specialty orders have adequate time to hit wholesale thresholds.
6. As a buyer who forgets to respond to a renewal check-in, I want my hold to automatically void after 48 hours of silence, so that my credit limit is protected by default.
7. As a Clan member whose group hits a cheaper discount tier right before checkout, I want the system to capture only the lower discounted price, so that I don't have to wait days for a partial refund.
8. As a platform operator, I want the final capture call to send `final_capture: true`, so that PayPal knows no additional captures will be made and is intended to release any uncaptured balance.
9. As a platform operator, I want to avoid post-capture price refunds for volume discounts, so that the platform does not lose non-refundable PayPal payment processing fees.
10. As a platform operator, I want failed or expired Clans to execute automated voids on open authorizations, so that buyer credit holds are terminated cleanly without merchant charges.

### Idempotency, Gateway & Crash Recovery
11. As a platform engineer, I want all financial calls to route strictly through a centralized `PayPalMoneyGateway` deep module, so that no developer or agent can accidentally bypass token caching or idempotency rules.
12. As a platform engineer, I want the gateway to write an `IdempotencyRecord` as `PENDING` to PostgreSQL before contacting PayPal, so that crashes mid-flight leave an immutable record of intent.
13. As a platform engineer, I want every idempotency key to be generated strictly from stable business facts (`hash(operation_type:clan_id:member_id:stage:reference)`), so that duplicate webhooks or retried requests never produce conflicting keys.
14. As a platform engineer, I want the gateway to reject volatile caches (Redis) in the monetary path, so that financial correctness is backed entirely by ACID transactions in PostgreSQL.
15. As a platform engineer, I want a background reconciliation daemon to scan stale `PENDING` operations using `SELECT ... FOR UPDATE SKIP LOCKED`, so that multiple server instances never double-process the same transaction.
16. As a platform engineer, I want the reconciliation daemon to measure safety from `first_sent_at` and never reset that timestamp on resends, so that the remote PayPal key retention window is strictly respected.
17. As a platform engineer, I want the reconciliation daemon to query PayPal's GET authorization/order/capture endpoints before retrying, so that already-completed payments are recorded as `SUCCEEDED` without re-executing charges.
18. As a platform operator, I want operations that remain `PENDING` outside the PayPal key retention window to transition to `NEEDS_REVIEW`, so that human operators are alerted rather than blindly retrying expired keys.
19. As a platform engineer, I want ESLint and continuous integration checks to block any file outside `src/gateway/` from importing PayPal packages or referencing PayPal hostnames, so that architectural boundaries are enforced automatically.
20. As a platform engineer, I want the application configuration (`src/config/gateway.config.ts`) to validate with Zod at startup and fail fast without logging secret values, so that missing credentials or invalid timeouts are caught before traffic arrives.

### Fulfillment & Delivery Synchronization
21. As a wholesale supplier, I want to ship separate parcels directly to each bakery's shipping address (collected at join time by Developer 1), so that I handle all shipping and carrier choice outside the app.
22. As a wholesale supplier, I want to register tracking numbers against individual buyer payments using Orders v2 `POST /v2/checkout/orders/{id}/track`, so that PayPal records proof of fulfillment for seller protection.
23. As a wholesale supplier, I want a dedicated delivery confirmation endpoint (`POST /api/delivery/confirm`), so that I can report when each parcel has arrived.
24. As a buyer's agent, I want to submit a delivery confirmation via `POST /api/delivery/confirm` when Maria tells me her flour arrived, so that her delivery receipt is recorded.
25. As a platform operator, I want the 48-hour inspection countdown to start at the later of the supplier's and buyer's confirmations, so that both parties' inputs are recorded.
26. As a wholesale supplier, I want an automatic confirmation rule that starts the inspection window 2 days after my confirmation if the buyer remains silent, so that unresponsive buyers cannot delay payout indefinitely.
27. As a test engineer, I want a `simulate-delivery` CLI command that fakes both the supplier's and the buyer's delivery confirmations in development/demo environments, so that fulfillment can be tested deterministically without real carrier events.

### Claims, Dispute Mediation & Settlement
28. As a buyer who receives damaged flour bags, I want my personal agent to intake damaged unit counts, photos, and descriptions, so that I do not have to fill out complicated legal forms.
29. As a platform operator, I want code to deterministically cap any damage claim to `min(damaged_units * unit_price, order_value)`, so that an agent or buyer cannot request refunds exceeding the actual goods delivered.
30. As a buyer (reviewer), I want to review and approve the structured claim before it is sent to the supplier, so that my personal agent never submits claims without my explicit approval.
31. As a supplier, I want to receive in-app damage claims and choose to accept, counter-offer, or reject them, so that I can resolve legitimate packaging issues amicably.
32. As a buyer who receives a counter-offer from the supplier, I want to review and approve the counter before my agent accepts it, so that I maintain final authority over financial settlements.
33. As a buyer and supplier who agree on a partial refund in the app, I want the platform to immediately refund the agreed amount from escrow and reduce the supplier's payout accordingly, so that small disputes settle instantly without opening external PayPal disputes.
34. As a buyer whose claim is rejected by the supplier, I want the claim to fall back to an official PayPal Customer Dispute where my agent continues to support me, so that PayPal's formal protection applies.
35. As a wholesale supplier, I want to review external PayPal dispute details, photos, and the capped claim amount through a dedicated approval endpoint (`POST /api/disputes/offers/approve`), so that I decide whether to approve or decline sending a formal settlement offer.
36. As a wholesale supplier, I want our platform account to dispatch `make_offer` in PayPal's dispute system only after I have approved a specific amount, ensuring that the offer amount never exceeds the capped claim amount or the member's payment.
37. As a buyer who discovers damage after the 48-hour inspection window, I want my agent to help me open a late dispute on PayPal, so that PayPal's longer buyer protection windows (up to 30 days for damaged goods or 180 days for non-receipt) remain accessible.
38. As a platform operator, I want the supplier agreement to require the supplier to repay us if PayPal rules for a buyer on a late dispute after the supplier has been paid, so that our platform balance is protected.
39. As a platform operator, I want a strict invariant that only one refund path (in-app escrow refund or PayPal dispute refund) is ever executed for a single claim, so that duplicate refunds are prevented.
40. As a wholesale supplier whose parcel clears the 48-hour inspection window with no open claim, I want my share paid out automatically via PayPal Payouts (`sendSupplierPayout`), so that I receive my bulk revenue incrementally without waiting for other buyers.
41. As a platform engineer, I want PayPal webhook notifications verified cryptographically and processed idempotently, so that duplicate or out-of-order webhooks never trigger double payments or false state transitions.
42. As a business accountant, I want successful settlements to fire Zapier webhooks to accounting systems (QuickBooks/Xero), so that general ledger entries are updated automatically upon payout.
43. As a developer running tests, I want a read-only `doctor-escrow` command in `control-syndicate.mjs`, so that I can verify database connectivity, OAuth token caching, configuration validity, and boundary imports in a single command without moving money.

---

## Implementation Decisions

### 1. Architectural Seams & Testing Seams
The implementation defines three distinct testing seams:

* **Seam 1: Command-Line Interface (`control-syndicate.mjs`) [Highest Seam]:**  
  Exercises the entire system end-to-end against PostgreSQL and PayPal Sandbox. Provides commands for:
  * `doctor-escrow`: Read-only health check.
  * `seed-demo`: Creates Clan and member test fixtures.
  * `lock-escrow`: Executes batch final captures.
  * `simulate-delivery`: Fakes supplier and buyer delivery confirmations.
  * `submit-claim`: Ingests an in-app buyer damage claim.
  * `respond-claim`: Emulates supplier accept, counter, or reject for in-app claims.
  * `approve-dispute-offer`: Emulates supplier approval of a formal PayPal dispute offer.
  * `payout-supplier`: Triggers PayPal Payouts for settled members.
  * `open-late-dispute`: Emulates post-window dispute forwarding to PayPal.
* **Seam 2: Gateway Deep Module (`src/gateway/PayPalMoneyGateway.ts`):**  
  The single programmatic entry point for all PayPal interactions. It encapsulates OAuth token management, `IdempotencyRecord` pre-writes, APIMatic-generated SDK clients, and Zod runtime payload boundary validations.
* **Seam 3: Pure Money Math and State Machine Engine [Lowest / Pure Seam]:**  
  Tests pure pricing tier calculations, pro-rata claim caps (`min(damaged * unitPrice, orderValue)`), and Clan state transitions (`FORMING` -> `LOCKED` -> `FULFILLING` -> `SETTLED`) in complete isolation with zero network or PayPal dependencies.

### 2. Modules to Build and Modify
* **`src/config/gateway.config.ts`**: Centralized configuration module using Zod. Fails fast on boot if timing parameters, secrets, or URLs are invalid. Masked logging ensures no secret values appear in error traces.
* **`src/gateway/PayPalMoneyGateway.ts`**: The exclusive module authorized to communicate with PayPal API hosts (`api-m.sandbox.paypal.com`).
  * `authorizeHold(params)`: Orders v2 `POST /v2/checkout/orders` with `intent: "AUTHORIZE"`.
  * `completeAuthorization(orderId, clanId, memberId)`: Orders v2 `POST /v2/checkout/orders/{id}/authorize` (called immediately upon buyer return or webhook approval, within 6 hours of sending buyer to PayPal).
  * `finalBatchCapture(params)`: Payments v2 `POST /v2/payments/authorizations/{id}/capture` with `final_capture: true` and the final discounted tier price. Confirmed in sandbox `evidence/thin-capture.json` to transition authorization to `CAPTURED` and release remaining hold automatically.
  * `createRefund(params)`: Payments v2 `POST /v2/payments/captures/{id}/refund` (used only for post-capture in-app dispute settlements and errors).
  * `sendSupplierPayout(params)`: PayPal Payouts v1 `POST /v1/payments/payouts` using operation type `PAYOUT`, protected by idempotency and covered by reconciliation.
  * `voidAuthorization(params)`: Payments v2 `POST /v2/payments/authorizations/{id}/void` (used for cancelled or expired clans).
  * `registerTracking(params)`: Orders v2 `POST /v2/checkout/orders/{id}/track` with `capture_id`.
  * `submitDisputeOffer(params)`: Customer Disputes v1 `POST /v1/customer/disputes/{id}/make-offer`. Requires a valid supplier approval record (`supplierApproverId`, `approvedAmount`, `approvedAt`). Enforces that `approvedAmount <= min(damaged_units * unit_price, order_value)` and `<= memberPaymentAmount`. Checks PayPal's `response_options` to ensure `MAKE_OFFER` is permitted before invoking. The gateway refuses to send an offer without supplier approval or if the amount exceeds the cap.
  * `reconcileStalePending(params)`: The recovery routine executing against stale `PENDING` idempotency rows.
* **`src/gateway/paypal-webhook.handler.ts`**: Verifies incoming `PAYPAL-TRANSMISSION-SIG` headers against PayPal's verification service or local public cert, deduplicates events by event ID, and safely ignores out-of-order messages.
* **`src/daemon/reconciliation.worker.ts`**: The background worker polling stale `PENDING` rows using `SELECT ... FOR UPDATE SKIP LOCKED`. Covers captures, voids, refunds, and payouts.
* **`src/adapter/delivery.adapter.ts`**: Ingestion layer handling delivery confirmation events. Provides `POST /api/delivery/confirm` endpoint for suppliers and buyer agents. Updates `supplierDeliveredAt` and `buyerDeliveredAt` independently, writes each timestamp once, and sets `inspectionWindowEndsAt` to 48 hours after the later confirmation (or 2 days after supplier confirmation upon buyer silence).
* **`src/routes/disputes.ts`**: Provides `POST /api/disputes/offers/approve` where the supplier reviews dispute details, damage photos, and the capped claim amount, and submits approval or declination for a PayPal dispute offer.
* **`scripts/control-syndicate.mjs`**: The verification CLI updated with new commands.

### 3. Database Schema Extensions (Prisma / PostgreSQL)
Extend the existing Prisma schema with:

```prisma
enum IdempotencyStatus {
  PENDING
  SUCCEEDED
  FAILED
  NEEDS_REVIEW
}

model IdempotencyRecord {
  id              String            @id @default(cuid())
  operationKey    String            @unique // hash(operation_type:clan_id:member_id:stage:reference)
  operationType   String            // AUTHORIZATION, CAPTURE, REFUND, VOID, PAYOUT
  clanId          String
  memberId        String?
  stage           String
  referenceId     String?           // PayPal order_id, authorization_id, capture_id, payout_batch_id, or dispute_id
  paypalReference String?           // ID returned by PayPal upon success
  status          IdempotencyStatus @default(PENDING)
  firstSentAt     DateTime          @default(now())
  lastCheckedAt   DateTime          @updatedAt
  recheckCount    Int               @default(0)
  createdAt       DateTime          @default(now())

  @@index([status, firstSentAt])
}

model DeliveryRecord {
  id                    String    @id @default(cuid())
  clanId                String
  memberId              String    @unique
  trackingNumber        String
  carrierName           String
  supplierDeliveredAt   DateTime?
  buyerDeliveredAt      DateTime?
  inspectionWindowEndsAt DateTime?
  source                String    // "supplier", "buyer", "auto_confirmed", "simulated"
  conditionNotes        String?
  createdAt             DateTime  @default(now())
}

model DisputeOfferApproval {
  id                 String   @id @default(cuid())
  paypalDisputeId    String   @unique
  memberId           String
  supplierApproverId String
  approvedAmount     Decimal  @db.Decimal(10, 2)
  cappedAmount       Decimal  @db.Decimal(10, 2)
  status             String   // "APPROVED", "DECLINED"
  approvedAt         DateTime @default(now())
}
```

### 4. Technical Clarifications & Open Assumptions Matrix
* **Leftover hold release (`final_capture: true`) [Confirmed in Sandbox]:** Verified in `evidence/thin-capture.json`. When `final_capture: true` is sent on capture `POST /v2/payments/authorizations/{id}/capture` with amount $1,160.00 against an initial $1,440.00 hold, PayPal immediately transitions the authorization status to `CAPTURED`. The uncaptured $280.00 remainder drops automatically. No explicit `POST /v2/payments/authorizations/{id}/void` call is required or permitted.
* **Orders v2 Tracking Response [Confirmed in Sandbox]:** Verified in `evidence/thin-tracking.json`. Calling `POST /v2/checkout/orders/{id}/track` with `{ capture_id, tracking_number, carrier: "UPS", notify_payer: true }` succeeds with HTTP 201. PayPal creates tracker `<capture_id>-<tracking_number>` with status `SHIPPED` and embeds it directly in the Order resource.
* **Partial Refund & Fee Retention [Confirmed in Sandbox]:** Verified in `evidence/thin-refund.json`. Calling `POST /v2/payments/captures/{id}/refund` for $116.00 against capture `74H63527HK822241U` returns status `COMPLETED`. In `seller_payable_breakdown`, PayPal reports `paypal_fee: 0.00`. PayPal retains processing fees on refunds and refunds only the gross payment portion.
* **Reauthorization at renewal check-ins [Unconfirmed]:** PayPal documents a 3-day honor period and 29-day validity (30 on webhook docs). Test how `POST /v2/payments/authorizations/{id}/reauthorize` behaves in sandbox.
* **Idempotency key retention on capture requests [Unconfirmed]:** Orders capture docs state 6 hours, while general docs state up to 45 days. Sandbox tests will measure actual retention.
* **PayPal Payouts [Confirmed in Sandbox]:** Verified in `evidence/thin-payout.json`. Calling `POST /v1/payments/payouts` targeting the wholesale supplier account (`sb-t43fur53471579@business.example.com`) returns HTTP 201 with batch status `PENDING` and payout batch ID `4YARQWK7HTLRN`. Funds are disbursed directly from the platform account balance with GET read-back confirmed via `/v1/payments/payouts/{id}`.
* **Dispute creation and balance shortfall [Unconfirmed]:** Test how to create a dispute in the sandbox and observe what PayPal does if a dispute refund is awarded when our platform balance is insufficient to cover it.
* **Supplier dispute response deadline [Unconfirmed]:** What happens if the supplier does not respond before PayPal's dispute response deadline, and what that deadline is. To be tested and confirmed in the sandbox without a chosen default.
* **Dependencies on Developer 1:** Shipping address is collected when a bakery joins the Clan (Developer 1's domain). All physical shipping and carrier selection belong entirely to the supplier, outside our application.

---

## Testing Decisions

### Test Strategy: Behavior-First Verification
Testing asserts observable external behavior across three seams:

1. **Deterministic Idempotency Tests:**
   * Kill process mid-batch capture: verify on resume that already-captured members are not recharged and remaining members complete using identical keys.
   * Duplicate dispatch test: dispatch identical capture payloads concurrently; verify only one call hits PayPal and the second returns the stored record.
   * Expired key test: simulate a `PENDING` record older than the retention window; verify the worker marks `NEEDS_REVIEW` and halts rather than blindly retrying.
2. **Batch Final Capture & Price-Tier Fixture:**
   * Fixture setup: 5 members join, each pledging 100 bags at Tier 2 pricing ($7.20/bag = $720 hold each).
   * 5 more members join, expanding the pool to 1,000 bags and unlocking Tier 3 pricing ($5.80/bag).
   * Execute batch final capture: assert PayPal captures exactly $580 per member. Check whether the remaining $140 authorization hold is released.
3. **Two-Party Delivery and Inspection Window Invariant Tests:**
   * Supplier confirms delivery at $T_0$.
   * Buyer confirms delivery at $T_0 + 4\text{ hours}$.
   * Assert inspection countdown ends exactly 48 hours after the buyer's confirmation ($T_0 + 52\text{ hours}$).
   * Test 2-day buyer silence rule: supplier confirms at $T_0$, buyer remains silent. Assert inspection countdown triggers on day 2 ($T_0 + 48\text{ hours}$) and expires 48 hours later ($T_0 + 96\text{ hours}$).
   * Simulate confirmations via `control-syndicate.mjs simulate-delivery`: assert both confirmations are set with source `simulated`.
4. **Dispute Capping, Supplier Approval & Single-Refund Invariant:**
   * In-app damage claim submitted for 20 bags at $5.80 ($116).
   * Verify claim requires Maria's explicit buyer approval before being sent to supplier.
   * Supplier accepts: verify $116 refunded from escrow to Maria and supplier payout reduced from $580 to $464.
   * Gateway offer authorization tests:
     * Gateway refuses `submitDisputeOffer` if no supplier approval record exists in `DisputeOfferApproval`.
     * Gateway refuses `submitDisputeOffer` if approved amount exceeds the capped claim amount ($116) or the member payment.
     * With valid supplier approval within cap, gateway verifies `response_options` and dispatches `make_offer`.
   * Late dispute test: open a dispute after the 48-hour window has expired. Verify the dispute is forwarded to PayPal with agent support.
   * Single-refund invariant test: verify that an accepted PayPal dispute refund blocks and never triggers a second refund from our app.
5. **Architectural Boundary Linter:**
   * Static scan script asserting that zero files outside `src/gateway/` contain imports matching `@paypal/*` or string references to `api-m.sandbox.paypal.com`.

### The Sandbox Verification Suite (9 Foundational Tests)
Developer 2 must run and pass the following 9 live sandbox tests:
1. **Leftover hold:** Capture $580 against a $720 hold with `final_capture: true`. Confirm whether the $140 balance is released.
2. **Reauthorization:** Reauthorize a hold after day 3. Check allowed frequency and ID persistence.
3. **Key memory:** Send duplicate captures with the same idempotency key after varied delay intervals to verify PayPal's actual retention window.
4. **Hold, capture, and partial refund:** Run the complete path and issue a $116 refund from a captured payment. Confirm fee treatment and net balances.
5. **Tracking:** Register tracking via `POST /v2/checkout/orders/{id}/track` and read back tracker details.
6. **Dispute:** Create a test sandbox dispute, inspect `response_options`, and submit a test settlement offer.
7. **Payout:** Execute a test payout via `POST /v1/payments/payouts` from our business account to a sandbox supplier account.
8. **Duplicate messages:** Send duplicate and out-of-order PayPal webhook events and confirm idempotency.
9. **Late dispute:** Open a test dispute after payout settlement. Verify account balance handling when funds are refunded.

---

## Out of Scope

The following features belong strictly to **Developer 1** and are out of scope for this specification:
* SME natural language ingress endpoints (`POST /api/sme/spawn`) and prompt parsing.
* External chat bot webhooks (Telegram, Grok Bot) and HMAC signature ingress guards.
* Kernel cloud browser scraping workers for wholesale supplier tier tables.
* Clan matchmaking lobby, radial graph A2A visual negotiation arena, and frontend UI components.
* AG Grid frontend layout and live cell flashing components.

---

## Further Notes

### Pre-Implementation Checklist
Before writing business logic against this spec:
1. Confirm test sandbox credentials in `.env` (`PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `PAYPAL_WEBHOOK_ID`).
2. Run database migration to create `IdempotencyRecord`, `DeliveryRecord`, and `DisputeOfferApproval` tables in PostgreSQL.
3. Execute `node scripts/control-syndicate.mjs doctor-escrow` to verify baseline sandbox connectivity.
4. Run the Sandbox Verification Suite to settle the open unconfirmed items.
