# Wholeshare Agent Harness: Component Synthesis & Control Specification

This document specifies the exact components integrated from frontier open-source agent harnesses, the complete capability matrix, and the verification loop for the local `qwen3.5:9b` model.

---

## 1. Provenance Matrix: Component Sourcing and Rationale

The Wholeshare harness synthesizes proven patterns from six frontier systems into a single lightweight TypeScript engine.

| Source Architecture | Extracted Capability | Integration Purpose in Wholeshare |
| :--- | :--- | :--- |
| **Stripe & OpenAI ACP** | Shared Payment Tokens (SPTs) & Spend Requests | Cryptographic spending bounds, SKU whitelist, and 24-hour expiration tokens. |
| **Temporal & Inngest** | Durable State Machine & Event Journaling | Checkpointing state to PostgreSQL so multi-hour coalitions survive server restarts. |
| **OpenAI Agents SDK / Pi** | Lightweight Model Runner Interface | Minimal JSON prompt formatting, thinking-tag stripping, and 0ms deterministic fallback. |
| **Kernel Cloud Browser** | Headless Wholesale Sourcing Worker | Scrapes live B2B supplier price tiers with screenshot proofs cached in PostgreSQL. |
| **PayPal Agent Toolkit** | Native Business Rails Primitives | Orders v2 `AUTHORIZE` soft holds, Payments v2 capture, Invoicing v2 QR step-up, Tracking v1. |
| **LiteLLM / AI Gateway** | Bi-Directional Asynchronous Gateway | Ingress HMAC verification with immediate task ACK + egress signed webhook callbacks. |

---

## 2. What All Can the Harness Control?

The harness serves as the central control plane across five distinct subsystems:

```
                                [ Wholeshare Core Harness ]
                                             |
     +-----------------+---------------------+---------------------+-----------------+
     |                 |                     |                     |                 |
     v                 v                     v                     v                 v
[ External Bots ]  [ Kernel Browser ]   [ Local Qwen 3.5 ]   [ PostgreSQL FSM ]  [ PayPal Rails ]
 - Grok Bot         - Headless scrape    - Structured JSON    - Atomic row lock   - Orders v2 AUTH
 - Telegram Bot     - MOQ price tiers    - Allocation split   - Event journal     - Batch capture
 - Instinct Agent   - Screenshot hash    - 0ms rule fallback  - State replay      - Invoicing QR
 - SSE Web Client   - Fallback cache     - No float math      - Durable resume    - Tracking v1
```

### 2.1 Subsystem 1: External Agent Ingress and Egress
- Ingests signed purchase mandates via `POST /api/v1/mandates`.
- Validates HMAC-SHA256 signatures and 300-second replay windows.
- Returns immediate HTTP 202 with a durable `taskId` and `sharedPaymentToken`.
- Pushes signed webhook callbacks (`callbackUrl`) when coalitions hit thresholds, require step-up, or settle.
- Streams live progress to frontends via Server-Sent Events (`GET /api/v1/events`).

### 2.2 Subsystem 2: Kernel Cloud Browser Scraping
- Launches headless cloud browser sessions to scrape live wholesale supplier catalogs.
- Extracts volume discount matrices (Tier 1, Tier 2, Tier 3 MOQ pricing).
- Caches screenshot proofs and pricing tables in PostgreSQL with a 24-hour time to live.

### 2.3 Subsystem 3: Local Model Orchestrator (`qwen3.5:9b`)
- Formats token-efficient JSON prompts containing member demands and volume tiers.
- Strips `<think>` tags and parses structured allocations safely.
- Enforces a zero-millisecond deterministic allocation engine if the Ollama daemon is offline or exceeds 5,000 milliseconds.

### 2.4 Subsystem 4: Durable State Machine and Concurrency
- Enforces strict state progression: `FORMING` -> `THRESHOLD_MET` -> `AWAITING_STEP_UP` -> `LOCKED` -> `FULFILLING` -> `SETTLED`.
- Executes atomic row-level locks (`SELECT ... FOR UPDATE`) to prevent race conditions during concurrent buyer pledges.
- Writes append-only audit events for every transition, allowing instant crash recovery.

### 2.5 Subsystem 5: PayPal Business Financial Mutations
- Intercepts all allocation outputs against 10 pure mathematical invariants before touching APIs.
- Generates PayPal Invoicing v2 QR codes for owner step-up authorization if spend exceeds $5,000.00 or buyer limits.
- Dispatches Orders v2 with `intent: "AUTHORIZE"` to lock soft funds without upfront capital capture.
- Triggers batch settlement only when 100 percent of coalition members are authorized.
- Syncs carrier tracking numbers through PayPal Shipment Tracking v1.

---

## 3. The Ten Pre-Execution Interceptor Invariants

1. **Integer Cents**: All currencies and units must be positive integers. Floats are rejected.
2. **Hard Spend Cap**: Allocation amount cannot exceed mandate `maxSpendCents`.
3. **Platform Ceiling**: Allocations exceeding $5,000.00 (500,000 cents) mandate QR step-up.
4. **Mandate Ceiling**: Allocations exceeding buyer `stepUpThresholdCents` mandate QR step-up.
5. **Exact Volume Balance**: Sum of allocated units must equal total coalition units.
6. **Exact Financial Balance**: Sum of allocated cents must equal total units multiplied by unit price cents.
7. **Discount Floor**: Unit price cents cannot exceed catalog unit price cents.
8. **Soft Authorization Intent**: Order creation intent must be strictly `"AUTHORIZE"`.
9. **Single Allocation**: Duplicate buyer identifiers in a single coalition are rejected.
10. **Replay Protection**: Nonce and deterministic idempotency key are required.

---

## 4. Verification Loop and Quality Checklist

Before committing any feature, run the automated verification battery:

```bash
# 1. Code quality and deslop check (enforces short sentences, zero emojis, zero long dashes)
npm run lint

# 2. Feature map compliance check (enforces 4-header standard across all feature maps)
npm run lint:features

# 3. Environment health and microservice check (Node, Python, Docker, PayPal, Kernel)
npm run doctor

# 4. PayPal agent toolkit operational verification (verifies 47 business tools)
npm run toolkit:test

# 5. Dry-run multiparty escrow authorization and batch capture test
npm run verify
```

---

## 5. Feature Map Catalog

All user-facing capabilities are documented under `.cursor/skills/verify-syndicate/references/features/`:
- `agentic-commerce-acp.md`: Shared Payment Tokens and spend request delegation.
- `clan-lobby.md`: Coalition discovery and natural language spawner.
- `a2a-arena.md`: Real-time negotiation visualizer and SSE stream.
- `ag-grid-ledger.md`: Live order book with master-detail rows and cell flashing.
- `escrow-lifecycle.md`: PayPal Orders v2 `AUTHORIZE` soft hold and batch capture.
- `rate-limiting-gateway.md`: HMAC verification and replay protection.
- `judge-simulator.md`: 1-click end-to-end evaluation bar.
- `cloud-deploy-render.md`: Render infrastructure blueprint.
