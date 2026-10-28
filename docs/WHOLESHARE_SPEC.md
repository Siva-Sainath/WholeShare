# Wholeshare: B2B Group Purchasing and Agentic Escrow Architecture

This document specifies the technical architecture for Wholeshare. Wholeshare enables small businesses to pool purchase volume and unlock tier-one wholesale discounts. The platform coordinates buyer agents, pools demand into shared orders, and executes multiparty escrow through native PayPal APIs.

---

## 1. Product Thesis and Brand Identity

Small and medium enterprises pay premium rates for inventory because their individual orders fall below supplier minimum order quantities. Large enterprises receive discounts of 30 percent to 50 percent because they purchase by freight containers.

Wholeshare eliminates this pricing disparity. The name represents shared access to closed wholesale pricing. Independent businesses split bulk freight shipments without taking on inventory risk or counterparty default risk. A shared order executes only when buyer commitments reach the minimum volume target.

Autonomous buyer agents join purchasing coalitions through open protocols. Buyers delegate purchase mandates with hard spending limits. Deterministic software enforces financial safety while language models negotiate deal allocations.

---

## 2. Universal Agent Ingress Gateway

Frontier artificial intelligence applications use different interaction protocols. Anthropic Claude, Cursor, and Zed use the Model Context Protocol. OpenAI ChatGPT, Grok, and web agents use HTTP endpoints, OpenAPI specifications, and the Agentic Commerce Protocol.

Wholeshare provides a dual-ingress gateway so that any external agent can connect without custom adapters.

```
       [ Anthropic Claude / Cursor / Zed ]        [ OpenAI / Grok / Personal Bots ]
                        |                                          |
             (Model Context Protocol)                     (A2A Protocol & ACP)
                        |                                          |
                 stdio or /mcp SSE                     /.well-known/agent.json
                        |                                          |
                        +--------------------+---------------------+
                                             |
                                  [ Ingress Normalizer ]
                                             |
                               [ TypeScript Policy Sandwich ]
                                             |
                                   [ PostgreSQL Engine ]
                                             |
                                   [ PayPal Rails API ]
```

### 2.1 Agent-to-Agent Discovery and ACP Specification

Wholeshare serves an Agent Card at `/.well-known/agent.json`. The card declares service capabilities, authentication requirements, and available actions.

Agents submit signed purchase mandates conforming to the Agentic Commerce Protocol. Each mandate contains four mandatory parameters:
1. Target stock keeping unit identifier.
2. Minimum acceptable discount percentage.
3. Maximum spending limit in integer cents.
4. Human verification threshold in integer cents.

Proposals arrive at `/api/a2a/proposals` as standard JSON-RPC 2.0 payloads. The server responds with an immediate acknowledgement and streams coalition state changes over Server-Sent Events at `/api/a2a/events`.

### 2.2 Model Context Protocol Server

Desktop and IDE agents connect to the Wholeshare server through the Model Context Protocol. The server provides three operational tools:
1. `list_active_syndicates`: Discovers open coalitions and current fill percentages.
2. `propose_syndicate_pledge`: Commits buyer volume to a target coalition.
3. `inspect_syndicate_ledger`: Returns real-time escrow authorizations and settlement status.

---

## 3. The TypeScript Policy Sandwich

Natural language models introduce variance and hallucination risk. Financial software requires absolute mathematical certainty.

Wholeshare solves this tension with the policy sandwich architecture. The language model operates purely as an intake router and allocation negotiator. Deterministic TypeScript code wraps the model on both sides.

```
+-------------------------------------------------------------------+
| 1. Ingress Boundary Guard (Validates schema, HMAC, and spend cap) |
+-------------------------------------------------------------------+
                                  |
                                  v
+-------------------------------------------------------------------+
| 2. Language Model Orchestrator (qwen3.5:9b negotiation proposal)  |
+-------------------------------------------------------------------+
                                  |
                                  v
+-------------------------------------------------------------------+
| 3. Egress Policy Guard (Enforces 10 mathematical financial rules) |
+-------------------------------------------------------------------+
                                  |
                                  v
+-------------------------------------------------------------------+
| 4. Native PayPal Mutation API (Orders v2 soft hold AUTHORIZE)     |
+-------------------------------------------------------------------+
```

### 3.1 Ten Mandatory Financial Invariants

The egress policy guard evaluates ten invariants before invoking any financial mutation API:

1. **Integer Arithmetic**: All monetary quantities use integer cents. Floating point values are rejected.
2. **Hard Spend Cap**: Individual authorization totals cannot exceed the buyer mandate cap.
3. **Global Platform Ceiling**: Any single authorization exceeding 500,000 cents ($5,000.00) requires human verification.
4. **Buyer Mandate Step-Up**: Any authorization exceeding the buyer declared limit requires human verification.
5. **Exact Allocation Sum**: The sum of member volumes must equal total coalition volume.
6. **Exact Financial Balancing**: Total authorized cents must equal unit price cents multiplied by total units.
7. **Discount Floor**: Final unit price cannot exceed initial single-unit catalog price.
8. **Soft Authorization Intent**: Order creation requests must specify `intent: "AUTHORIZE"`. Direct capture is forbidden during coalition formation.
9. **Single Allocation Per Member**: A buyer cannot hold multiple active allocations in the same coalition.
10. **Replay Protection**: Every transaction payload must contain a deterministic idempotency key.

Violations halt processing immediately. The platform returns a structured error and logs the event.

---

## 4. Model Orchestrator

The local orchestrator runs `qwen3.5:9b` (Q4_K_M) on Apple Silicon hardware.

```
+--------------------+      +--------------------+      +--------------------+
|  qwen3.5:9b Local  | ---> |  DeepSeek-R1 Local | ---> | Deterministic Rule |
|    Ollama Engine   |      |   Ollama Engine    |      |      Fallback      |
+--------------------+      +--------------------+      +--------------------+
```

The model runner implements an abstract interface with automatic fallback:
1. Primary: Local `qwen3.5:9b` via Ollama HTTP API.
2. Secondary: Local `deepseek-r1:7b` via Ollama HTTP API.
3. Tertiary: Zero-millisecond deterministic allocation rule engine.

When local model services are unavailable or latency exceeds 5,000 milliseconds, the runner falls back to deterministic rule allocation.

---

## 5. PostgreSQL Database Architecture

Wholeshare uses standard PostgreSQL without third-party object-relational mapping frameworks. This design eliminates subscription fees and supports native row-level locks.

### 5.1 Tables and Relations

```sql
CREATE TABLE syndicates (
    id VARCHAR(64) PRIMARY KEY,
    sku VARCHAR(64) NOT NULL,
    sku_name VARCHAR(255) NOT NULL,
    target_units INTEGER NOT NULL,
    current_units INTEGER NOT NULL DEFAULT 0,
    unit_price_cents BIGINT NOT NULL,
    discount_tier_pct NUMERIC(5, 2) NOT NULL DEFAULT 0.00,
    status VARCHAR(32) NOT NULL DEFAULT 'FORMING',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE syndicate_members (
    id VARCHAR(64) PRIMARY KEY,
    syndicate_id VARCHAR(64) NOT NULL REFERENCES syndicates(id) ON DELETE CASCADE,
    buyer_name VARCHAR(255) NOT NULL,
    buyer_email VARCHAR(255) NOT NULL,
    pledged_units INTEGER NOT NULL,
    authorized_cents BIGINT NOT NULL DEFAULT 0,
    status VARCHAR(32) NOT NULL DEFAULT 'PLEDGED',
    paypal_order_id VARCHAR(64),
    step_up_required BOOLEAN NOT NULL DEFAULT FALSE,
    qr_code_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE audit_events (
    id BIGSERIAL PRIMARY KEY,
    syndicate_id VARCHAR(64) NOT NULL REFERENCES syndicates(id) ON DELETE CASCADE,
    event_type VARCHAR(64) NOT NULL,
    payload JSONB NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
```

### 5.2 Concurrency and Atomic Locks

Syndicate state transitions use explicit row locks to prevent race conditions:

```sql
BEGIN;
SELECT * FROM syndicates WHERE id = $1 FOR UPDATE;
-- Validate coalition volume and threshold rules
UPDATE syndicates SET current_units = current_units + $2 WHERE id = $1;
COMMIT;
```

---

## 6. PayPal Business Rails Mapping

Financial operations map directly to native PayPal Business primitives:

| Operation | PayPal API Primitive | Intent and Parameters |
| :--- | :--- | :--- |
| Escrow Soft Hold | Orders v2 (`POST /v2/checkout/orders`) | `intent: "AUTHORIZE"`, amount in integer cents. Soft hold prevents upfront capital lockup. |
| Owner Step-Up Verification | Invoicing v2 (`POST /v2/invoicing/invoices` + QR) | Generates PayPal QR code when amount exceeds user mandate or $5,000 ceiling. |
| Batch Execution | Orders v2 (`POST /v2/checkout/orders/{id}/authorize`) | Authorizes holds simultaneously when coalition reaches 100 percent volume. |
| Final Settlement | Payments v2 (`POST /v2/payments/authorizations/{id}/capture`) | Captures authorized funds upon delivery confirmation. |

---

## 7. Verification and Test Protocol

The verification harness is implemented in `scripts/control-wholeshare.js`. The script executes non-interactive tests against the system.

Core verification subcommands include:
- `doctor`: Inspects PostgreSQL connectivity, local model responsiveness, and environment keys.
- `seed`: Inserts standard buyer personas and product fixtures.
- `spawn-buyer`: Simulates an external agent submitting a purchase mandate.
- `evaluate-coalition`: Runs the model orchestrator and verifies the policy sandwich against the ten invariants.
- `audit-features`: Validates feature map markdown files against current code routes.

---

## 8. Development Sequence

1. Define core domain types and token schemas in `src/lib/types.ts`.
2. Implement the ten financial invariants in `src/lib/policy.js`.
3. Implement the model orchestrator with fallback chain in `src/lib/model-runner.js`.
4. Implement A2A discovery card and Model Context Protocol server in `src/lib/ingress.js`.
5. Implement PostgreSQL migration and repository layer in `src/lib/db.js`.
6. Implement PayPal Orders v2 authorization adapter in `src/lib/paypal.js`.
7. Verify entire flow using `scripts/control-wholeshare.js`.
