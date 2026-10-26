# Wholeshare: Production Agent Harness Quality Specification

This document synthesizes empirical findings from recent artificial intelligence engineering literature, Hacker News production postmortems, and arXiv research. It establishes the non-negotiable quality criteria for the Wholeshare agent harness.

---

## 1. Empirical Grounding and Literature Synthesis

Recent research on agent harnesses demonstrates a fundamental shift. Safety and reliability do not come from model prompt tuning. They come from the deterministic execution harness that wraps the model.

### 1.1 Key Literature Findings

1. **The Fallacy of Text-Only Guardrails (arXiv:2407.xxxxx, HarnessAudit-Bench)**:
   Content filters and prompt guards operate only on textual input and output. They fail to track state mid-trajectory. Violations accumulate in resource access and financial routing. Safety must be enforced at the harness runtime layer.
2. **The 90-10 Production Rule (Hacker News Practitioner Consensus)**:
   Production agent systems are ninety percent traditional software engineering and ten percent prompt orchestration. Treating language models as untrusted, probabilistic microservices within a deterministic state machine produces reliable systems.
3. **The Multi-Agent Council Anti-Pattern**:
   Multi-agent debate councils (architect, developer, reviewer personas arguing in loops) introduce severe latency and compounded error rates. A single capable model with rich context and deterministic validation consistently outperforms multi-agent councils.
4. **Carrier Persistence and Delayed Failures (HarnessSafe)**:
   Attacker-influenced payloads can persist across memory and tool artifacts. Untrusted inputs must be stripped and validated at every state transition.
5. **Durable Execution and Long-Running Workflows (Temporal & Inngest)**:
   Multi-party transactions require hours or days to pool volume. In-memory loops leak connections and fail during server restarts. Durable event journaling in PostgreSQL allows safe resumption without duplicate financial mutations.

---

## 2. Empirical Matrix: Techniques That Work vs Techniques That Fail

| Architectural Dimension | Techniques That Fail (Anti-Patterns) | Techniques That Work (Wholeshare Standard) |
| :--- | :--- | :--- |
| **Control Flow** | Unbounded while-loops where model decides when to stop. | Deterministic Finite State Machine (FSM) with hard iteration limits. |
| **State Ownership** | In-memory session objects and volatile agent context. | Append-only event store in PostgreSQL with row-level locks. |
| **Tool Execution** | Directly passing model output to financial mutation APIs. | Pre-execution deterministic interceptor with strict schema gates. |
| **Arithmetic** | Natural language reasoning over floating point decimals. | Integer cents throughout. Strict schema rejection of floats. |
| **Agent Coordination** | Autonomous persona councils debating in chat threads. | Single scoped orchestrator (`qwen3.5:9b`) evaluated against pure rules. |
| **Network Lifecycle** | Blocking HTTP requests held open while waiting for buyers. | Bi-directional gateway: immediate HTTP ack + async webhook callbacks. |
| **Failure Recovery** | Naive retries starting from step one. | Checkpointed resumption using deterministic idempotency keys. |

---

## 3. The Six Architectural Invariants of the Wholeshare Harness

Every line of code in the Wholeshare harness must preserve these six invariants:

1. **Deterministic State Transitions**:
   The harness dictates which state follows. The language model computes values for the current state, but it never alters the transition graph.
2. **Zero-Trust Tool Interception**:
   No external mutation API (such as PayPal Orders v2) is invoked without passing through the deterministic interceptor.
3. **Integer Cent Arithmetic**:
   All monetary amounts, volume allocations, and unit prices must be positive integers. Decimal values trigger immediate rejection.
4. **Idempotency on All External Mutations**:
   Every mutation includes a deterministic `PayPal-Request-Id` derived from the hash of the coalition identifier, member identifier, and lifecycle state.
5. **Durable Checkpoint Before Mutation**:
   The state machine writes an audit record to PostgreSQL before dispatching any network mutation.
6. **Strict Asynchronous Separation**:
   Ingress handlers never block waiting for multi-party consensus. Ingress issues an acknowledgement. Egress notifies callers through webhook callbacks and Server-Sent Events.

---

## 4. Finite State Machine Specification

The coalition lifecycle follows an explicit directed state graph.

```
       [ FORMING ]
            |
            | (Volume >= MOQ Target)
            v
     [ THRESHOLD_MET ]
            |
            | (Pre-execution interceptor passes)
            v
     [ AWAITING_STEP_UP ]  <-- (If amount > $5,000 or user limit)
            |
            | (Owner approves via PayPal QR code)
            v
         [ LOCKED ]
            |
            | (Atomic batch Orders v2 AUTHORIZE soft hold)
            v
       [ FULFILLING ]
            |
            | (Shipment delivered and verified)
            v
        [ SETTLED ]
```

### State Definitions and Invariant Guards

- **FORMING**:
  - Ingress accepts member mandates conforming to the Agentic Commerce Protocol.
  - Updates total volume atomically via `SELECT ... FOR UPDATE`.
- **THRESHOLD_MET**:
  - Coalition volume meets or exceeds the minimum order quantity.
  - Triggers model orchestrator (`qwen3.5:9b`) to propose allocation splits.
- **AWAITING_STEP_UP**:
  - Activated if any allocation exceeds the buyer declared limit or $5,000.00.
  - Emits a PayPal Invoicing v2 QR code to the buyer bot via webhook callback.
- **LOCKED**:
  - 100 percent of allocations are approved.
  - Executes PayPal Orders v2 soft holds with `intent: "AUTHORIZE"`.
- **FULFILLING**:
  - Supplier ships order.
  - Carrier tracking registered via PayPal Shipment Tracking v1.
- **SETTLED**:
  - Batch payment capture executed.
  - Funds release to supplier.

---

## 5. Ingress and Egress Gateway Specification

The gateway coordinates external user bots (Grok Bot, Telegram bots, Instinct agents) without proprietary adapters.

```
+-------------------------------------------------------------------------+
| INGRESS: POST /api/v1/mandates                                          |
| - Verifies HMAC-SHA256 signature in X-Wholeshare-Signature header       |
| - Validates replay window (request timestamp within 300 seconds)        |
| - Checks integer bounds: requestedUnits > 0, maxSpendCents > 0          |
| - Writes mandate to PostgreSQL                                          |
| - Returns HTTP 202 Accepted with taskId and sharedPaymentToken          |
+-------------------------------------------------------------------------+
                                     |
                                     v
+-------------------------------------------------------------------------+
| EGRESS: POST {buyer_callback_url}                                       |
| - Dispatches signed webhook events:                                     |
|   1. wholeshare.coalition.joined                                        |
|   2. wholeshare.step_up_required (includes PayPal QR approval URL)      |
|   3. wholeshare.escrow.locked (includes PayPal authorization ID)        |
|   4. wholeshare.order.settled                                           |
| - Delivers live visual progress over GET /api/v1/events (SSE)           |
+-------------------------------------------------------------------------+
```

---

## 6. Verification and Quality Gates

Before declaring any feature complete, the harness must pass four automated verification gates:

1. **Static Invariant Gate**:
   `node scripts/verify-code-quality.js` enforces short sentences, zero long dashes, zero mid-sentence colons, and zero emojis.
2. **Deterministic Interceptor Gate**:
   `node --test test/policy.test.js` tests all 10 invariants under positive, boundary, and adversarial conditions.
3. **Durable State and Replay Gate**:
   `node scripts/control-syndicate.js test-durable-replay` simulates a process crash during coalition formation and verifies zero-loss state recovery.
4. **Feature Map Synchronization Gate**:
   `node scripts/lint-features.js` verifies that all user-facing routes have documented feature maps under `.cursor/skills/verify-syndicate/references/features/`.
