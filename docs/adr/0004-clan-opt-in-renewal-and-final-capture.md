# 0004: Clan Member Opt-In Renewal and Tier-Based Final Capture

## Context
Fixed 7-day timeouts across all purchasing groups either prematurely cancel legitimate, slower-forming bulk clans or hold buyer credit lines hostage for too long. Additionally, late-joining buyers unlocking cheaper volume tiers before checkout should not trigger messy post-capture refunds and unreturned payment processing fees.

## Decision
1. **Member Opt-In Renewal**: Authorizations follow order-type soft check-in windows:
   - Fast commodity: 5 days
   - Standard: 7 days
   - Specialty / seasonal: 10 days
   - High-value / custom: 12 days
   At day X, members receive an opt-in renewal request. Lack of response within 48 hours defaults to Opt-Out, automatically voiding their individual authorization. A hard deadline (3–7 days post-check-in) force-voids any remaining unrenewed authorizations.
2. **Tier-Based Final Capture**: Clan pricing is finalized before money moves. When a Clan reaches `LOCKED`, the batch capture daemon executes captures at the final unlocked tier price using `final_capture: true`.
3. PayPal's `create_refund` endpoint is reserved strictly for post-delivery disputes and operational errors, never for pre-capture volume pricing drops.

## Consequences
- Capital is freed automatically by default without breaking slow-forming clans for responsive buyers.
- Processing fees are conserved because PayPal retains transaction fees on refunds; capturing the final discounted price avoids refund fee penalties entirely.
- Leftover authorization hold amounts are automatically released by PayPal during final capture without requiring separate void calls.
