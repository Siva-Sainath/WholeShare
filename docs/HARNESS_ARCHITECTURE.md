# Wholeshare Agent Harness: Architectural Specification

This document defines the architecture, public interfaces, and verification loop for the Wholeshare agent harness.

---

## 1. System Overview and Grounding

The Wholeshare agent harness coordinates multi-agent B2B group buying. Small businesses pool purchase volume to unlock manufacturer minimum order quantities.

The harness isolates non-deterministic language model reasoning from financial execution. The language model acts as an intake classifier and allocation negotiator. Deterministic TypeScript code computes pricing tiers and enforces spend boundaries.

```
       [ External Agent: Claude / Cursor ]      [ External Agent: OpenAI / Grok ]
                       |                                        |
                 (MCP Protocol)                         (A2A / ACP Protocol)
                       |                                        |
                       +-------------------+--------------------+
                                           |
                                [ Universal Ingress ]
                                           |
                              [ Model Orchestrator ]
                            (qwen3.5:9b on Ollama)
                                           |
                         [ TypeScript Policy Sandwich ]
                       (10 Mathematical Invariants)
                                           |
                              [ Native PostgreSQL ]
                           (SELECT ... FOR UPDATE)
                                           |
                              [ PayPal Rails API ]
                           (intent: "AUTHORIZE")
```

---

## 2. Caller Usage Sketch

Before writing internal logic, we define how external callers and internal services drive the harness.

### 2.1 External Agent Ingress via A2A JSON-RPC

An external agent on OpenAI, Grok, or a custom runner submits a purchase mandate to the ingress gateway:

```javascript
// Caller sends an A2A JSON-RPC 2.0 proposal
const response = await fetch("http://localhost:3000/api/a2a/proposals", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    jsonrpc: "2.0",
    id: "req_001",
    method: "wholeshare.submit_mandate",
    params: {
      buyerId: "sme_austin_bakery",
      buyerName: "Austin Artisan Bakery",
      sku: "organic-flour-50lb",
      requestedUnits: 450,
      maxSpendCents: 500000,
      stepUpThresholdCents: 100000,
      minDiscountPct: 15
    }
  })
});

const result = await response.json();
// Returns { jsonrpc: "2.0", id: "req_001", result: { status: "ACCEPTED", sharedPaymentToken: "spt_..." } }
```

### 2.2 Model Orchestration and Policy Execution

The internal coalition service evaluates member demands and runs the model orchestrator:

```javascript
import { runModelNegotiation } from "./src/lib/model-runner.js";

const result = await runModelNegotiation({
  coalitionId: "coalition_flour_101",
  sku: "organic-flour-50lb",
  catalogPriceCents: 1200,
  discountTiers: [
    { minUnits: 500, discountPct: 10 },
    { minUnits: 1000, discountPct: 20 },
    { minUnits: 1200, discountPct: 25 }
  ],
  buyers: [
    { buyerId: "sme_austin_bakery", requestedUnits: 450, maxSpendCents: 500000, stepUpThresholdCents: 100000 },
    { buyerId: "sme_bean_roasters", requestedUnits: 500, maxSpendCents: 600000, stepUpThresholdCents: 200000 },
    { buyerId: "sme_green_cafe", requestedUnits: 350, maxSpendCents: 400000, stepUpThresholdCents: 150000 }
  ]
});

// Returns validated proposal guaranteed by the policy sandwich
console.log(result.proposal.unitPriceCents); // 900 cents
console.log(result.evaluation.valid); // true
console.log(result.evaluation.invariantsPassed.length); // 10
```

---

## 3. Structural Design Exploration

Following the architect skill, we examine two structurally distinct candidate designs.

### Candidate A: Layered Functional Pipeline

This architecture arranges logic into pure transformation functions:
1. `normalizeIngress(rawRequest) -> BuyerMandate`
2. `invokeModelOrchestrator(mandateGroup) -> RawProposal`
3. `evaluatePolicySandwich(rawProposal, constraints) -> ValidatedProposal`
4. `executePayPalHold(validatedProposal) -> EscrowReceipt`

- **Advantages**: Pure functions are straightforward to test. Zero hidden state. Clear caller sequence.
- **Interface Depth**: High. Callers interact with three top-level functions.

### Candidate B: Event-Driven Agent State Machine

This architecture uses an event bus where agents publish events (`MANDATE_RECEIVED`, `COALITION_FULL`, `POLICY_EVALUATED`, `ESCROW_LOCKED`):
1. Services subscribe to event topics.
2. In-memory queues manage transitions.

- **Disadvantages**: Harder to trace causal paths. Race conditions require distributed locks. Excessive hidden state.
- **Interface Depth**: Low. Callers must understand event topic routing.

### Synthesis Decision

We select **Candidate A: Layered Functional Pipeline**. It enforces system boundaries, isolates business logic in pure functions, and makes failures transparent.

---

## 4. Public Signatures and Module Shapes

```typescript
// src/lib/types.ts

export type SyndicateStatus =
  | "FORMING"
  | "THRESHOLD_MET"
  | "LOCKED"
  | "FULFILLING"
  | "SETTLED";

export interface BuyerMandate {
  buyerId: string;
  buyerName: string;
  buyerEmail: string;
  sku: string;
  requestedUnits: number;
  maxSpendCents: number;
  stepUpThresholdCents: number;
  minDiscountPct: number;
  nonce: string;
  createdAt: number;
  hmacSignature?: string;
}

export interface SharedPaymentToken {
  tokenId: string;
  buyerId: string;
  sku: string;
  maxAuthorizedCents: number;
  stepUpThresholdCents: number;
  expiresAt: number;
  nonce: string;
  hmacSignature: string;
}

export interface BuyerAllocation {
  buyerId: string;
  units: number;
  amountCents: number;
  stepUpRequired: boolean;
}

export interface ModelNegotiationProposal {
  coalitionId: string;
  sku: string;
  totalUnits: number;
  unitPriceCents: number;
  discountPct: number;
  allocations: BuyerAllocation[];
  intent: "AUTHORIZE";
  idempotencyKey: string;
  reasoning?: string;
}

export interface PolicyEvaluationResult {
  valid: boolean;
  invariantsPassed: string[];
  violations: string[];
  evaluatedAt: string;
  normalizedProposal?: ModelNegotiationProposal;
}
```

```javascript
// src/lib/policy.js

/**
 * Evaluates ten financial invariants against a model negotiation proposal.
 * Pure function with zero external side effects.
 */
export function evaluatePolicySandwich(proposal, context) {
  // Evaluates Invariants 1 through 10
  throw new Error("not implemented");
}
```

```javascript
// src/lib/token.js

/**
 * Creates an ACP Shared Payment Token signed with HMAC-SHA256.
 */
export function createSharedPaymentToken(mandate, secret) {
  throw new Error("not implemented");
}

/**
 * Verifies an ACP Shared Payment Token and checks expiration.
 */
export function verifySharedPaymentToken(token, secret) {
  throw new Error("not implemented");
}
```

```javascript
// src/lib/model-runner.js

/**
 * Runs the model orchestrator with fallback chain:
 * 1. Primary: Local qwen3.5:9b via Ollama HTTP API
 * 2. Secondary: Local deepseek-r1:7b via Ollama HTTP API
 * 3. Tertiary: Deterministic volume tier allocation engine
 */
export async function runModelNegotiation(context) {
  throw new Error("not implemented");
}
```

---

## 5. Ten Mandatory Financial Invariants

The policy sandwich strictly evaluates these ten rules:

1. **Integer Arithmetic**: Units and cents must be positive integers. Floats are rejected.
2. **Hard Spend Cap**: Buyer allocation cannot exceed mandate `maxSpendCents`.
3. **Platform Step-Up Ceiling**: Any allocation exceeding $5,000.00 (500,000 cents) mandates owner QR step-up.
4. **Mandate Step-Up Limit**: Any allocation exceeding buyer declared `stepUpThresholdCents` mandates owner QR step-up.
5. **Exact Allocation Sum**: Sum of member units must exactly match coalition total units.
6. **Exact Financial Balance**: Sum of allocated cents must equal total units multiplied by unit price cents.
7. **Discount Floor**: Unit price cents cannot exceed catalog unit price cents.
8. **Soft Authorization Intent**: Order creation intent must be strictly `"AUTHORIZE"`. Direct capture during coalition formation is forbidden.
9. **Single Allocation Per Member**: Duplicate allocations for the same buyer ID are rejected.
10. **Replay Protection**: Nonce and idempotency key are required.

---

## 6. The Closed-Loop Verification Protocol

Every feature must verify through automated levers before completion.

```
       [ 1. Doctor Environment Check ]
                     |
       [ 2. Domain Unit Tests (Tape/Node Test) ]
                     |
       [ 3. CLI Lever (control-syndicate.js) ]
                     |
       [ 4. Chrome CDP Headless DOM / ARIA Check ]
                     |
       [ 5. Feature Map Synchronization Audit ]
                     |
                 [ Done ]
```

1. **Doctor Check**:
   `node scripts/control-syndicate.js doctor` verifies Ollama responsiveness, PostgreSQL, and PayPal keys.
2. **Unit Test Gate**:
   `node --test test/policy.test.js` tests all 10 invariants under positive, boundary, and adversarial inputs.
3. **CLI Lever**:
   `node scripts/control-syndicate.js evaluate-coalition` tests model negotiation and policy enforcement.
4. **Chrome CDP Probe**:
   `node scripts/cdp-harness.js inspect` validates browser rendering and ARIA tree accessibility.
5. **Feature Map Audit**:
   `node scripts/lint-features.js` verifies that every user capability is documented under `.cursor/skills/verify-syndicate/references/features/`.
