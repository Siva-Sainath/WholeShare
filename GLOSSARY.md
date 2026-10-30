# SyndicatePay

SyndicatePay is a B2B group-purchasing and escrow platform enabling small businesses to aggregate purchase orders and reach wholesale volume pricing through PayPal.

## Language

### Group Purchasing & Clan Formation

**Clan**:
A temporary collective of independent businesses pooling order volumes to unlock a supplier's wholesale pricing tier.
_Avoid_: Buying group, pool, syndicate, cart

**Member**:
An independent business participating in a Clan by committing an order pledge.
_Avoid_: Customer, user, buyer, account

**Order Pledge**:
A member's binding quantity commitment to a Clan, constrained by a pre-authorized spending cap.
_Avoid_: Order, reservation, cart item

**Discount Tier**:
A supplier-defined bulk quantity threshold that reduces unit price for all Clan members once collectively achieved.
_Avoid_: Bulk discount, pricing step, volume bracket

**Spending Cap**:
The maximum unit price or total spend pre-authorized by a member when joining a Clan.
_Avoid_: Budget limit, order maximum, pledge ceiling

**Clan Lock**:
The state transition freezing Clan membership and pricing, triggering batch capture of authorized funds.
_Avoid_: Pool freeze, checkout close, order finalization

### Escrow & Payment Lifecycle

**Authorization Hold**:
A temporary freeze placed on a member's payment method that guarantees fund availability without an immediate debit.
_Avoid_: Charge, deposit, upfront payment

**Final Capture**:
The terminal debit of an authorized payment that collects the final unlocked tier price and permanently closes the authorization.
_Avoid_: Full capture, partial debit, second charge

**Batch Capture**:
The sequential execution of final captures across all Clan members once the Clan reaches its locked state.
_Avoid_: Bulk checkout, mass payment, pooled charge

**Opt-In Renewal**:
A scheduled check-in presented to Clan members during prolonged formation to confirm their continued commitment before an authorization expires.
_Avoid_: Re-authorization, contract extension, auto-renewal

**Escrow Record**:
An immutable audit trail linking a Clan order to its held, captured, or refunded funds.
_Avoid_: Holding account, wallet balance, pool fund

**Idempotency Record**:
A durable ledger entry capturing the intent, status, and external reference of a financial mutation to ensure exactly-once processing.
_Avoid_: Request cache, dedup token, API retry log

**Money Gateway**:
The authoritative system boundary through which all external financial movements and payment network interactions must pass.
_Avoid_: API client, HTTP helper, payment service

**Payment Reconciliation**:
The automated verification of pending monetary state against the payment provider's authoritative ledger.
_Avoid_: Polling loop, retry script, batch sweeper

### Fulfillment & Inspection

**Delivery Confirmation**:
A verified receipt signal submitted by either the supplier or buyer indicating that goods have arrived at the buyer's premises.
_Avoid_: Carrier webhook, tracking status, shipping notice

**Inspection Window**:
A forty-eight-hour period triggered by delivery confirmation during which members verify delivered goods before supplier payout occurs.
_Avoid_: Return period, cooling-off window, review delay

**Buyer Silence Auto-Confirmation**:
The automatic confirmation of delivery triggered two days after supplier confirmation when a member fails to acknowledge receipt.
_Avoid_: Default delivery, timeout receipt, presumed arrival

### Claims, Disputes & Settlement

**Damage Claim**:
A structured buyer petition detailing damaged or missing items, bounded by the delivered value of those goods.
_Avoid_: Dispute, complaint, support ticket, refund request

**Supplier Dispute Offer**:
A formal concession amount proposed by a supplier to resolve an active customer dispute.
_Avoid_: Counter-claim, settlement bid, discount refund

**Late Dispute**:
A formal customer dispute initiated after the inspection window has closed, requiring post-settlement debt recovery if ruled in the buyer's favor.
_Avoid_: Chargeback, post-window complaint, late claim

**Supplier Debt**:
An uncollected liability owed by a wholesale supplier back to the platform following a post-settlement dispute refund.
_Avoid_: Clawback, supplier deficit, negative balance

**Single-Refund Invariant**:
The operational rule guaranteeing that a member payment can be refunded through at most one pathway (in-app escrow or payment provider dispute).
_Avoid_: Double refund protection, duplicate refund guard

**Settlement**:
The disbursement of a member's net payment share to the supplier once inspection concludes without open claims.
_Avoid_: Payout, disbursement transfer, wire
