---
name: verify-syndicate
description: Deterministic verification harness for SyndicatePay PayPal Sandbox & Escrow infrastructure without mocks or in-memory substitutes.
---

# Verify Syndicate Skill

Deterministic verification harness for SyndicatePay's financial escrow, payment authorizations, payouts, and dispute mediation.

## Verification Invariant: Zero Mocks Policy

This repository strictly prohibits:
- Mocking libraries: `nock`, `msw`, `sinon`, `jest.mock`, `vi.mock` of gateway or PayPal modules.
- Hard-coded fake PayPal IDs (`FAKE_AUTH_*`, `MOCK_ORDER_*`, etc.).
- "Mock PayPal" environment switches or local in-memory PayPal emulators.

All verification runs directly against the real PayPal Sandbox (`api-m.sandbox.paypal.com`) with real credentials. Only two things may be simulated:
1. `simulate-delivery`: Emulates physical freight delivery events (supplier & buyer delivery confirmations) in development/demo mode only.
2. Pure money-math unit tests: Pure algorithmic assertions on tier calculations and claim caps that execute without any PayPal network calls.

---

## Execution Sequence

The harness executes in strict sequential order:

1. **Anti-Mock Static Boundary Scan**:
   ```bash
   node scripts/check-no-mocks.mjs
   ```
   Fails the run if any prohibited mock or fake ID pattern is detected.

2. **Read-Only Health Check (`doctor-escrow`)**:
   ```bash
   node scripts/control-syndicate.mjs doctor-escrow
   ```
   Verifies:
   - PostgreSQL connectivity and `IdempotencyRecord` table existence.
   - PayPal Sandbox OAuth2 token generation and caching.
   - Gateway boundary check (no `@paypal` or `api-m.sandbox.paypal.com` references outside `src/gateway/`).
   - Zod configuration schema validation.

3. **Deterministic Fixture Seeding (`seed-demo`)**:
   ```bash
   node scripts/control-syndicate.mjs seed-demo
   ```
   Creates the Clan and member records for the 3-member Tier 2 + 1-member Tier 3 sandbox fixture.

4. **The Sandbox Verification Suite**:
   Runs the live sandbox tests sequentially, writing evidence files for each.

---

## Evidence and Read-Back Requirements

Every sandbox test must produce an evidence file at:
`.scratch/developer-2-escrow-settlement-disputes/evidence/<test-name>.json`

The evidence file must contain:
```json
{
  "timestamp": "ISO-8601 UTC timestamp",
  "endpoint": "Exact HTTP method and PayPal URL called",
  "request": { /* Request payload with secrets/tokens masked */ },
  "response": { /* Raw unmodified response from PayPal Sandbox */ },
  "paypalIds": {
    "orderId": "...",
    "authorizationId": "...",
    "captureId": "...",
    "refundId": "...",
    "payoutBatchId": "...",
    "disputeId": "..."
  },
  "readBackVerified": true,
  "readBackDetails": { /* Result of GET lookup verifying status on PayPal's ledger */ }
}
```

### Read-Back Rule
A test **passes only if every PayPal ID generated can be fetched back from PayPal Sandbox via a GET request and its status matches the expected state**.
- If a test cannot verify the ID via a GET lookup, it cannot be marked as passed.
- Without an evidence file, the feature remains marked as `[Unconfirmed]`.
- No specification or ADR may claim "Confirmed" without providing the specific evidence file path.

---

## Failure Handling Protocol

If any PayPal sandbox call fails (e.g. HTTP 401 Unauthorized, HTTP 403 Forbidden, missing Payouts permissions, unsupported sandbox feature):
1. **Stop immediately**: Do not continue downstream dependent operations for that test.
2. **Log the raw error**: Write the raw error response into `.scratch/developer-2-escrow-settlement-disputes/evidence/<test-name>-error.json`.
3. **No falsification**: Never substitute a simulated response, never alter request payloads to force artificial success, and never adjust expected outcomes.
4. **Mark status**: Mark the test item as `[Blocked]` or `[Unconfirmed]` and escalate to human operators if manual sandbox configuration is required.
