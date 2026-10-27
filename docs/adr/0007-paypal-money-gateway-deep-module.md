# 0007: PayPalMoneyGateway Deep Module and Boundary Enforcement

## Context
Spreading raw PayPal API calls or direct imports of the APIMatic-generated SDK across multiple route handlers, daemons, and test scripts risks bypassing idempotency pre-writes, mismanaging OAuth tokens, and violating financial invariants.

## Decision
1. **Centralized Encapsulation**: All interactions with PayPal's API must flow through a single deep module: `PayPalMoneyGateway`.
2. **Public Method Surface**:
   - `authorizeHold`
   - `completeAuthorization`
   - `finalBatchCapture`
   - `createRefund`
   - `voidAuthorization`
   - `submitDisputeOffer`
   - `registerTracking`
   - `reconcileStalePending`
3. **Internal Gateway Responsibilities**:
   - Manages OAuth2 token caching, proactively refreshing before expiration.
   - Enforces the `IdempotencyRecord` pre-write pattern (`PENDING` row insertion prior to external dispatch).
   - Validates all incoming and outgoing payloads using Zod schemas generated/paired with APIMatic TypeScript types.
4. **Enforced Boundary**: An ESLint restriction and CI check fail the build if any module outside `src/gateway/` imports the PayPal SDK or executes HTTP calls directly to PayPal API hosts.

## Consequences
- Financial logic, token lifecycle, and idempotency guarantees cannot be bypassed by new developers or agents.
- Simplifies testing and CLI harness integration: `control-syndicate.mjs` calls high-level gateway methods directly.
- Serves as the primary showcase for the APIMatic Hackathon prize track.
