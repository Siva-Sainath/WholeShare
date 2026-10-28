---
name: verify-syndicate
description: "Drive and verify SyndicatePay locally: inspect financial state, test rate-limiting prototypes, check Docker/Postgres microservices, run Chrome CDP and Python debugger probes, benchmark performance and inference, and audit feature maps. Built per pstack verification standards."
---

# Verify SyndicatePay

This is the project-local verification skill for SyndicatePay. Every agent working on this repo uses `control-syndicate.mjs` to inspect and drive the application end-to-end without requiring human intervention.

## 1. Quick Reference: The Master Control CLI

```bash
# Verify environment dependencies (Node, Python, Docker, Postgres, PayPal Sandbox, Kernel, Ports)
node .cursor/skills/verify-syndicate/control-syndicate.mjs doctor

# Verify PostgreSQL database connection pool, migrations, and table counts
node .cursor/skills/verify-syndicate/control-syndicate.mjs db:status

# Verify Docker Compose services (app, postgres, redis, python-microservice)
node .cursor/skills/verify-syndicate/control-syndicate.mjs docker:status

# Validate Render IaC cloud blueprint and sandbox credentials
node .cursor/skills/verify-syndicate/control-syndicate.mjs cloud:verify

# Audit feature maps against the mandatory pstack 4-header specification
node .cursor/skills/verify-syndicate/control-syndicate.mjs features:lint

# Run 3-way rate limiting benchmark (Token Bucket vs Leaky Bucket vs Sliding Window)
node .cursor/skills/verify-syndicate/control-syndicate.mjs rate-limit --requests 1000

# Run HMAC-SHA256 and V8 event loop latency performance benchmarks
node .cursor/skills/verify-syndicate/control-syndicate.mjs perf

# Run Agent tool calling and policy sandwich latency benchmark
node .cursor/skills/verify-syndicate/control-syndicate.mjs inference

# Inspect DOM/ARIA tree and Core Web Vitals via Chrome DevTools Protocol (CDP)
node .cursor/skills/verify-syndicate/control-syndicate.mjs cdp:inspect

# Inspect Python pdb debugger hooks and cProfile function trace
node .cursor/skills/verify-syndicate/control-syndicate.mjs debug:python

# Inspect registered @paypal/agent-toolkit tools and status
node .cursor/skills/verify-syndicate/control-syndicate.mjs toolkit:inspect

# Inspect Agentic Commerce Protocol (ACP) specification manifest
node .cursor/skills/verify-syndicate/control-syndicate.mjs acp:manifest

# Test Conversational Natural Language Ingress with coffee shop prompt
node .cursor/skills/verify-syndicate/control-syndicate.mjs ingress:nlp

# Run 1-click Austin Coffee Syndicate Judge Simulation
node .cursor/skills/verify-syndicate/control-syndicate.mjs judge:demo

# Seed deterministic test state (3 SME Personas + 2 Clans + Scraped Wholesale Tiers)
node .cursor/skills/verify-syndicate/control-syndicate.mjs seed-demo --reset

# Drive Stage 1: Spawn SME with bounded policy & AR pre-flight check
node .cursor/skills/verify-syndicate/control-syndicate.mjs spawn-sme \
  --name "Austin Artisan Bakery" \
  --sku "organic-flour-50lb" \
  --qty 15 \
  --max-usd 450

# Drive Stage 2: Matchmake Clan to 100% MOQ threshold
node .cursor/skills/verify-syndicate/control-syndicate.mjs match-clan \
  --sku "organic-flour-50lb" \
  --simulate-agents 3

# Wait for SSE streams and database transitions to settle
node .cursor/skills/verify-syndicate/control-syndicate.mjs wait-settle

# Drive Stage 3: Lock PayPal Multiparty Escrow (Order AUTHORIZE + Batch CAPTURE)
node .cursor/skills/verify-syndicate/control-syndicate.mjs lock-escrow \
  --clan-id "clan_flour_01" \
  --dry-run false

# Drive Stage 4: Simulate damaged shipment & APIMatic pro-rata dispute refund
node .cursor/skills/verify-syndicate/control-syndicate.mjs trigger-dispute \
  --clan-id "clan_flour_01" \
  --sme-index 2 \
  --damage-pct 25

# Capture UI accessibility snapshot (ARIA tree) and screenshot
node .cursor/skills/verify-syndicate/control-syndicate.mjs snapshot --component "ag-grid-ledger"
node .cursor/skills/verify-syndicate/control-syndicate.mjs screenshot docs/assets/syndicate-proof.png
```

## 2. Zero-Simulation & Zero-Mock Policy
Wholeshare strictly prohibits mocks, stubs, and simulated fallback tokens across all runtime code and integration verifications:
1. Never mock, stub, or simulate PayPal, databases, or external APIs unless the operator grants prior explicit permission.
2. If credentials or network endpoints are missing or invalid, doctor and runtime checks must fail fast with actionable recovery instructions.
3. Every test verifying external integrations must exercise real network endpoints or be classified strictly as pure domain unit logic.
