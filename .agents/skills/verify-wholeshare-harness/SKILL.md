---
name: verify-wholeshare-harness
description: "Verification lever for the Wholeshare agent harness: inspects database event journaling, tests reflexive self-correction, audits ACP Shared Payment Tokens, runs the Codex adversarial gauntlet, and verifies PayPal tool integration."
---

# Verify Wholeshare Harness

This skill drives and verifies the Wholeshare agent harness locally. It enforces strict architectural compliance, prevents deviation into frontend distractions, and verifies that the harness satisfies all financial safety invariants.

## 1. Launch

The harness runs as a headless Node.js service backed by PostgreSQL and Ollama.

```bash
# Verify local Ollama daemon is running with qwen3.5:9b
curl -s http://127.0.0.1:11434/api/tags | grep "qwen3.5:9b"

# Run PostgreSQL database migrations
node -e 'import("./src/lib/db.js").then(m => m.runMigrations())'
```

Usable state means:
1. PostgreSQL accepts connections and tables `coalitions`, `coalition_members`, `audit_events`, `agent_sessions`, and `agent_steps` exist.
2. Ollama responds on `http://127.0.0.1:11434` with model `qwen3.5:9b` loaded.

## 2. Doctor

Execute the health diagnostic before running any harness operations:

```bash
node scripts/control-wholeshare.js doctor
```

The doctor asserts:
- Node.js runtime version >= 20.
- PostgreSQL connection pool is healthy.
- Ollama daemon is responsive.
- PayPal sandbox credentials are loaded.
- Zero pending unapplied database migrations.

## 3. Drive

Drive the harness through five strict verification workflows:

### Workflow A: Durable Checkpointing & State Recovery
Simulate process termination during multi-turn negotiation and assert that execution resumes from PostgreSQL without state loss:
```bash
node scripts/control-wholeshare.js verify-durable-resume --session-id "test_recovery_01"
```

### Workflow B: Reflexive Self-Correction (Pi Pattern)
Inject a deliberately violated allocation (such as exceeding spend cap) and assert that Qwen 3.5 9B reflects on the violation error and corrects the allocation within 2 turns:
```bash
node scripts/control-wholeshare.js verify-reflection --sku "organic-flour-50lb"
```

### Workflow C: Codex Adversarial Invariant Gauntlet
Execute 15 hostile attack vectors against the pre-execution interceptor and assert 100% interception:
```bash
node --test test/adversarial-gauntlet.test.js
```

### Workflow D: External Agent Ingress & Webhook Egress
Submit an HMAC-signed ACP purchase mandate, verify HTTP 202 Accepted, and verify signed webhook dispatch:
```bash
node scripts/control-wholeshare.js verify-gateway
```

### Workflow E: PayPal Agent Toolkit Integration
Exercise native PayPal Business rails (`@paypal/agent-toolkit`) for Orders v2 soft authorization holds and Invoicing v2 QR generation:
```bash
node scripts/control-wholeshare.js verify-paypal-toolkit
```

### Workflow F: Vercel AI SDK Live Tool Loop
Exercises multi-step tool execution with local Qwen 3.5 9B and `@paypal/agent-toolkit/ai-sdk` against PayPal Sandbox:
```bash
node scripts/control-wholeshare.js verify-ai-sdk
```

## 4. Evidence

All verification evidence must be captured as real observable output:
- **Database Records**: Query `agent_steps` and `audit_events` to prove row insertion.
- **Console Proof**: Structured JSON output with duration, invariant checks, and execution source.
- **Signature Proof**: Verify that HMAC-SHA256 headers are cryptographically valid.

Evidence is saved to:
- `docs/assets/harness-proof.json`
- `artifacts/harness-run-<timestamp>.json`

## 5. Cleanup

Kill only processes started during the verification run:
```bash
# Clean up temporary test sessions and reset demo state
node scripts/control-wholeshare.js reset-test-state
```

Proof artifacts and PostgreSQL database migrations are preserved.

## 6. Helpers

The primary driver is `scripts/control-wholeshare.js`. Run with `help` to view all available commands:
```bash
node scripts/control-wholeshare.js help
```

## 7. Zero-Simulation & Zero-Mock Policy

Wholeshare strictly prohibits mocks, stubs, and simulated fallback tokens across all runtime code and integration verifications:
1. Never mock, stub, or simulate PayPal, databases, or external APIs unless the operator grants prior explicit permission.
2. If credentials or network endpoints are missing or invalid, doctor and runtime checks must fail fast with actionable recovery instructions.
3. Every test verifying external integrations must exercise real network endpoints or be classified strictly as pure domain unit logic.

