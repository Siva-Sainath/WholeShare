# 0001: Two-Phase Authorization Escrow via PayPal Orders v2

## Context
In multi-party B2B purchasing syndicates, charging small businesses upfront before Minimum Order Quantities (MOQs) are reached introduces high transaction fee churn and credit card chargeback liabilities if the pool fails to form. Furthermore, SyndicatePay cannot hold fiat balances directly without money transmitter licensing.

## Decision
We enforce a two-phase commit escrow model using native PayPal Orders v2 with `intent: "AUTHORIZE"`. Member funds are placed on temporary authorization hold directly in PayPal's custody when joining a Clan. Funds are only captured atomically via `POST /v2/payments/authorizations/{id}/capture` when 100% of the volume threshold is met and carrier fulfillment begins. If a Clan fails to hit quorum within 7 days, authorization holds are voided without processing fees.

## Consequences
- Zero direct custody liability for SyndicatePay.
- Unbacked or fraudulent bids are blocked at ingress since an authorization hold requires valid payment credentials.
- Authorization holds expire after 29 days on PayPal; the system must enforce a 7-day timeout sweeper.
