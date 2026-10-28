# Wholeshare: Agent Operating Guidelines & Compact Memory

This file is automatically loaded by coding agents and provides the enduring memory, principles, and execution protocols for Wholeshare. When context compacts or resets, read this file to regain complete grounding.

---

## 1. Agent Configuration & Skills

### Issue Tracker
Issues and specifications are tracked as local markdown files in `.scratch/`. See `docs/agents/issue-tracker.md`.

### Triage Labels
Canonical triage label vocabulary: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain Docs
Single-context repository layout. See `docs/agents/domain.md`.

---

## 2. The Three North Stars

Every architectural decision, code diff, and verification run is evaluated against these three non-negotiable North Stars:

1. **User Experience (Delight, Latency, & Clarity)**
   - The user must experience immediate, perceptible value.
   - UI interactions must be sub-second, jank-free, and visually stunning (AG Grid cell flashing, dynamic node graphs, and unambiguous step progress).
   - Errors must be human-readable with immediate actionable recovery steps, never raw stack traces or silent failures.

2. **Effectiveness of Solving the Problem (Zero-Fraud B2B Escrow)**
   - Small businesses pool demand safely without counterparty default risk.
   - Financial operations use native PayPal primitives chained together: Orders v2 (`intent: "AUTHORIZE"` soft holds), atomic batch capture, shipment tracking verification, and APIMatic pro-rata dispute mediation.
   - The TypeScript policy sandwich guarantees mathematical spend boundaries regardless of natural-language LLM hallucinations.

3. **End-to-End Real Product That Deploys Cleanly**
   - No mock-only toys or throwaway hacks.
   - Infrastructure as Code (Render blueprint `render.yaml`, Docker Compose `docker-compose.yml`, Prisma PostgreSQL schema `schema.prisma`).
   - Every feature must be reproducible locally in 1 click and verify completely green in automated testing.

---

## 3. Poteto Mode Escalation & Protocols

### Scenario A: Confusion about Runtime Mechanics, Wiring, or Ownership
- **Trigger**: "How does this module communicate?", "Which service owns this state?", "Where is this event handled?"
- **Action**: Invoke the `/how` methodology.
  1. Inspect boundary types and schemas (`src/lib/`, `src/gateway/`, `schema/`).
  2. Trace caller-callee sequences from entry point to database or external API.
  3. Validate that business logic resides in pure functions and edge adapters remain thin (`principle-boundary-discipline`).

### Scenario B: Confusion about Rationale, Invariants, or Past Design
- **Trigger**: "Why was this threshold set to 28%?", "Why do we use Orders v2 AUTHORIZE instead of direct CAPTURE?", "Why do we require invoice QR codes above $1,000?"
- **Action**: Invoke the `/why` methodology.
  1. Inspect anti-fraud policy definitions in `src/lib/policy.ts` and architecture specs in `docs/SYNDICATE_SPEC.md`.
  2. Verify FinTech invariants: soft authorization prevents locking working capital prematurely; QR codes enforce step-up KYC for high-value transactions.
  3. Base conclusions on concrete code evidence and documented constraints.

### Scenario C: Empirical Fork ("Which approach / algorithm / architecture is better?")
- **Trigger**: Choosing between rate limiting styles (Token Bucket vs Leaky Bucket vs Redis Sliding Window), caching strategies, database query patterns, or UI layouts.
- **Action**: Build prototypes side-by-side, benchmark them using verification commands, explain the numbers, and select the empirical winner.
