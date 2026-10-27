# 0009: Simulated Carrier Delivery Adapter for Local Verification

## Context
Authoritative delivery confirmation (`carrierDeliveredAt`) must originate from a carrier-verified event rather than PayPal tracking uploads or system clock manipulation. However, automated testing and hackathon judging cannot wait for real-world freight carriers.

## Decision
We expose a dedicated simulation command in `control-syndicate.mjs`:
`node .cursor/skills/verify-syndicate/control-syndicate.mjs simulate-delivery --clan-id <id> [--status DELIVERED|DAMAGED_IN_TRANSIT] [--notes <text>]`
1. **Environment Gate**: The command executes only in `development` or `demo` modes; it hard-fails if invoked against `production`.
2. **Adapter Path**: It dispatches a signed event through the exact delivery adapter pipeline used by real carrier webhooks rather than writing directly to the database.
3. **Delivery Semantics**:
   - Both `DELIVERED` and `DAMAGED_IN_TRANSIT` set the single-write `carrierDeliveredAt` timestamp (damaged goods are still physically delivered) and trigger the 48-hour inspection window.
   - Damaged condition flags and notes are recorded in separate inspection fields.
4. **Audit and Output**:
   - The delivery source is stamped as `simulated`.
   - Subsequent calls on the same Clan record no change and report existing values.
   - Outputs machine-readable JSON: `clanId`, `status`, `carrierDeliveredAt`, `inspectionWindowEnd`, `source`.

## Consequences
- Enables 100% deterministic local testing and live hackathon demonstration of the delivery-to-dispute flow.
- Prohibits unauthorized manual tampering with delivery timestamps in production.
