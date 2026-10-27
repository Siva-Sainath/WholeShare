# 0003: Human Manager Approval for Dispute Settlement Offers

## Context
Full automated autonomous refund issuance exposes the platform and wholesale suppliers to adversarial exploitation, hallucinated calculations, and fraudulent photo submissions.

## Decision
We enforce human-in-the-loop approval for all dispute refund offers.
1. The AI agent acts strictly as an intake and communication mediator: collecting damaged unit counts, damage categories, requested refund amounts, and photographs.
2. Code deterministically caps the maximum claimable refund at `min(damaged_units * unit_price, order_value)`.
3. Code runs non-blocking verification heuristics: 48-hour delivery window check, perceptual SHA-256 photo hash comparison, photo count consistency, and carrier delivery confirmation. These heuristics generate warning flags for the reviewer.
4. The case enters an `ARBITRATION` state freezing funds until a human manager reviews the claim, capped amount, photos, and flags.
5. PayPal's `make_offer` API is invoked only after explicit human manager approval while the dispute is in PayPal's `INQUIRY` stage.
6. The `adjudicate` sandbox endpoint is forbidden in production environments.

## Consequences
- Zero unauthorized or autonomous fund loss from AI mediation.
- Managers are assisted with pre-calculated caps and fraud flags, keeping review time under 60 seconds per case.
- Formal PayPal dispute rules are respected without bypassing the merchant's right of review.
