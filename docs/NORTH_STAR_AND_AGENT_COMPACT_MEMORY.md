# North Star, Poteto Mode Escalation, & Memory Compaction Reference

This document serves as the materialized memory for Wholeshare agents. When memory compacts during long development sessions, this reference ensures continuity, architectural rigor, and adherence to the core pstack principles.

---

## 1. The Three North Stars

### North Star 1: User Experience (Delight, Latency, & Clarity)
- **Visual Command Center**: The interface is an intuitive, high-density financial command dashboard featuring AG Grid Master-Detail views, radial A2A agent canvas graphs, and real-time status badges.
- **Sub-Second Performance**: UI interactions must respond in under 200ms. Cell updates flash with subtle animations (emerald for authorization, amber for dispute refunds).
- **Zero Ambiguity**: Financial states (`FORMING`, `THRESHOLD_MET`, `LOCKED`, `FULFILLING`, `DISPUTED`, `SETTLED`) are visibly unambiguous at all times.

### North Star 2: Effectiveness in Solving B2B Purchasing
- **Problem**: Small businesses cannot independently unlock tier 2/3 bulk volume discounts (often 25-45% cheaper) and risk counterparty defaults in informal group buys.
- **Solution**: Wholeshare pools purchasing volume into automated "Clans" using autonomous Personal Agents.
- **FinTech Safety**: Pledges are backed by PayPal Orders v2 (`intent: "AUTHORIZE"`). Funds are never deducted until 100% of the clan threshold is met. Atomic batch capture executes simultaneously, and carrier tracking bounds the dispute refund window.
- **Tamper Resistance**: Bounded TypeScript policy sandwiches enforce financial guardrails before any API calls are dispatched.

### North Star 3: Real Product Deployment & Reproducibility
- **Infrastructure as Code**: Production deployable via `render.yaml` with managed PostgreSQL and web services.
- **Containerization**: Local parity via `docker-compose.yml` orchestrating PostgreSQL, Redis, and microservices.
- **Autonomous Verifiability**: Any engineer or AI agent can clone this repo, run `control-syndicate.mjs doctor`, and seed, match, lock, dispute, and verify without manual configuration.

---

## 2. Poteto Mode Escalation & Confusion Protocols

When an agent encounters an obstacle or question, follow this decision tree:

```
                    [ Agent Encounters Ambiguity ]
                                  |
        +-------------------------+-------------------------+
        |                                                   |
[ Flow / Ownership / Wiring ]                     [ Rationale / Invariants ]
        |                                                   |
  Run /how Flow                                       Run /why Flow
  - Check boundary types                              - Inspect anti-fraud policy
  - Verify caller-callee                              - Review schema invariants
  - Keep domain logic pure                            - Check historical specs
        |                                                   |
        +-------------------------+-------------------------+
                                  |
                   [ Empirical Fork Encountered ]
            (e.g., Which rate limiter? Which DB query?)
                                  |
                    DO NOT ASK THE OPERATOR!
                                  |
                     Apply Prototype Playbook
             - principle-exhaust-the-design-space
             - Build 2-3 side-by-side candidates
             - Benchmark with control-syndicate CLI
             - Apply principle-explain-the-number
             - Choose based on measured metrics
```

### Protocol 1: Clarifying Runtime Mechanics via `/how`
- Trace the boundary adapters at `src/lib/paypal.ts`, `src/lib/kernel.ts`, `src/lib/apimatic.ts`.
- Ensure boundary types parse external data into branded domain models (`principle-boundary-discipline`, `principle-type-system-discipline`).
- Internal business logic must remain pure and free from framework lock-in.

### Protocol 2: Clarifying Invariants via `/why`
- Query the fraud prevention rules:
  - *Why soft authorization?* Direct capture would deduct funds prematurely from SMEs before clan MOQ threshold is confirmed.
  - *Why QR code invoice step-up?* Transactions exceeding $1,000 exceed automated policy caps and mandate human-in-the-loop cryptographic confirmation.
  - *Why APIMatic pro-rata refunds?* When a shipment arrives damaged, carrier tracking verifies the delivery timestamp and pro-rata damages are calculated mathematically rather than disputing the entire order.

### Protocol 3: Resolving Empirical Forks via Prototyping
- When selecting algorithms (e.g. rate limiters or query indexing):
  - Prototype variant A (e.g. In-memory Token Bucket).
  - Prototype variant B (e.g. Leaky Bucket).
  - Prototype variant C (e.g. Redis Sliding Window Log).
  - Measure RPS, latency spread (p50/p95/p99), and memory footprint.
  - Record the bottleneck (e.g., Node single-thread event loop delay or Redis round-trip latency).
  - Let the empirical numbers dictate the architecture.

---

## 3. Feature Map Contract & Maintenance Loop

### Mandatory Feature Document Structure
All feature documents under `.cursor/skills/verify-syndicate/references/features/` must contain:
1. `## Sub-features`: Granular component identifiers.
2. `## How to get to it (user POV)`: Visual UI locator, route, or CLI invocation.
3. `## Driving it with control-syndicate`: Preconditions, exact CLI commands, and proof criteria.
4. `## Gotchas`: Known constraints, throttling limits, or prerequisite stages.

### Agent Synchronization Duty
- Never submit or land code without updating the corresponding feature map.
- If a new screen, route, or API is introduced, author a new feature map file immediately.
- Run `node .cursor/skills/verify-syndicate/control-syndicate.mjs features:lint` to verify format compliance.

---

## 4. The 5-Step Verification & Reiteration Engine

1. **Health Check**: Run `doctor` to assert runtime prerequisites.
2. **Deterministic Seed**: Load reproducible test fixtures via `seed-demo --reset`.
3. **Execute Stage**: Trigger the modified lifecycle stage (`spawn-sme`, `match-clan`, `lock-escrow`, or `trigger-dispute`).
4. **Capture Proof**: Export ARIA tree snapshots (`snapshot`) and high-resolution screen proof (`screenshot`).
5. **Reiterate on Failure**: Root-cause anomalies directly at the origin rather than writing compensatory code.
