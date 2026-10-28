---
name: verify-zero-simulation
description: Verify that Wholeshare executes with zero mocks, zero simulations, and zero fake tokens across all API, UI, and harness flows. Drives live PayPal Sandbox and real file checks.
disable-model-invocation: true
---

# Verify Zero-Simulation

Every financial operation and document parsing action in Wholeshare must run against real systems: real PayPal Sandbox API endpoints, authentic OAuth bearer tokens, real binary file buffers, and cryptographic signatures. This skill drives the zero-simulation verification lever to prove that no mocks, fake tokens, or simulated responses contaminate execution paths.

## Launch

Verify environment health and ensure credentials and real benchmark files are present before driving:

```bash
node .cursor/skills/verify-syndicate/control-syndicate.mjs doctor
```

Wait until output reports `PAYPAL_SANDBOX_STATUS: "CONNECTED_LIVE"` and `status: "HEALTHY"`.

## Doctor

Execute a read-only audit to verify that live credentials and benchmark documents are loaded:

```bash
node -e '
import("./src/lib/env.js").then(async () => {
  const { existsSync } = await import("node:fs");
  const hasCreds = Boolean(process.env.PAYPAL_CLIENT_ID && process.env.PAYPAL_CLIENT_SECRET);
  const hasCorpus = existsSync("data/benchmark_corpus/07_vector_digital_invoice.pdf");
  console.log(JSON.stringify({ liveCredentialsPresent: hasCreds, corpusPresent: hasCorpus, ready: hasCreds && hasCorpus }));
});
'
```

If `ready` evaluates to `false`, do not proceed. Configure live credentials in `.env` first.

## Drive

Run the zero-simulation audit lever:

```bash
node scripts/verify-zero-simulation.js
```

The script exercises:
1. Static scan across `src/` to confirm absence of `MOCK_SANDBOX_TOKEN` and simulated fallbacks.
2. Live OAuth2 handshake against `https://api-m.sandbox.paypal.com/v1/oauth2/token`.
3. Live Orders v2 soft authorization creation and direct API read confirmation.
4. Binary extraction of real vector PDF documents without synthetic stubs.
5. Cryptographic HMAC validation rejecting forged headers.

## Evidence

The audit writes proof of live execution to:
`docs/assets/zero_simulation_proof.json`

Proof standards:
- PayPal order ID must be authentic and queryable directly via `GET /v2/checkout/orders/{id}`.
- OAuth token must be a live JWT/string exceeding 30 characters.
- Ingestion totals must match calculated line item sums in integer cents.
- Source code scan must detect 0 prohibited mock tokens.

## Cleanup

The audit creates soft authorization holds that automatically expire in the sandbox. Proof files in `docs/assets/` are preserved for review.

## Helpers

- Audit lever: `node scripts/verify-zero-simulation.js`
- Full harness verification: `node scripts/verify-full-harness-flow.js`
