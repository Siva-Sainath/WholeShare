# Wholeshare: PayPal Developer Integration & Autonomous Harness Architecture

This document explains the full integration of PayPal for Business APIs and the official PayPal Agent Toolkit into the Wholeshare autonomous procurement harness. It details the transition to the Vercel AI SDK, reflects on past engineering mistakes, and specifies the roadmap for Kernel.sh cloud browser integration.

---

## 1. PayPal Developer Capabilities in Wholeshare

PayPal provides nine distinct developer rails that map directly into Wholeshare's B2B group purchasing lifecycle:

| PayPal Capability | REST API Endpoint | Role in Wholeshare Harness |
| :--- | :--- | :--- |
| **Orders v2 (Soft Holds)** | `POST /v2/checkout/orders` (`intent: AUTHORIZE`) | Locks buyer escrow allocations without debiting funds prematurely until the coalition achieves 100% Minimum Order Quantity (MOQ). |
| **Orders v2 (Batch Capture)** | `POST /v2/payments/authorizations/{id}/capture` | Atomically captures authorized funds across all coalition members when the supplier contract executes. |
| **Invoicing v2 (Step-Up KYC)** | `POST /v2/invoicing/invoices` | Issues draft invoices with interactive payment links when an SME allocation exceeds its mandate spend threshold. |
| **Invoicing v2 (Dynamic QR)** | `POST /v2/invoicing/invoices/{id}/generate-qr-code` | Generates base64 QR codes rendered inside the UI workbench for mobile biometric verification. |
| **Billing Plans & Subscriptions** | `POST /v1/billing/plans` & `/v1/billing/subscriptions` | Enforces recurring Clan procurement schedules (for example, weekly 50lb flour deliveries or monthly roasted coffee bean replenishment). |
| **Shipment Tracking** | `POST /v1/shipping/trackers-batch` | Registers carrier tracking numbers (UPS, FedEx) to verify delivery milestones before final settlement disbursement. |
| **Customer Disputes** | `POST /v1/customer/disputes` & Webhooks | Ingests damaged shipment alerts (`CUSTOMER.DISPUTE.CREATED`) for Stage 3 pro-rata arbitration. |
| **Webhooks Ingress** | `POST /v1/notifications/webhooks` | Subscribes to real-time events (`CHECKOUT.ORDER.APPROVED`, `BILLING.SUBSCRIPTION.ACTIVATED`, `PAYMENT.SALE.COMPLETED`). |
| **PayPal Agent Toolkit** | `@paypal/agent-toolkit/ai-sdk` | Exposes 47 typed function declarations to the autonomous model loop. |

---

## 2. Vercel AI SDK & Local Model Architecture

Wholeshare utilizes the Vercel AI SDK (`ai@4.3.19`) paired with `@ai-sdk/openai@1.3.24` pointing to a local Ollama daemon (`http://127.0.0.1:11434/v1`).

```
                ┌───────────────────────────────────────────────┐
                │          Autonomous Agent / Operator          │
                └───────────────────────┬───────────────────────┘
                                        │
                                        ▼
                     [Vercel AI SDK: generateText / streamText]
                                        │
                ┌───────────────────────┴───────────────────────┐
                │                                               │
                ▼                                               ▼
    [Local Language Model]                         [Tool Registry & Execution]
 createOpenAI({ baseURL: "..." })                     47 PayPal Agent Tools
        ("qwen3.5:9b")                             + 4 Wholeshare Domain Tools
                │                                               │
                │                                               ▼
                │                                   [Policy Sandwich Guard]
                │                                   - Exact integer cents only
                │                                   - Intent: AUTHORIZE only
                │                                   - Spend cap boundary
                │                                               │
                │                                               ▼
                │                                   [PayPal Sandbox REST API]
                │                                   api-m.sandbox.paypal.com
                │                                               │
                └───────────────────────┬───────────────────────┘
                                        │
                                        ▼
                            [PostgreSQL Audit Journal]
                           agent_sessions & agent_steps
```

### 2.1 Tool Execution Protocol
1. Local Qwen 3.5 9B evaluates the prompt and determines whether to invoke external commerce tools.
2. The Vercel AI SDK formats tool calls and passes arguments to the policy sandwich interceptor (`src/lib/interceptor.js`).
3. The policy interceptor enforces mathematical spend boundaries, rejects floating-point amounts, and blocks any direct `CAPTURE` intents.
4. The verified tool runs against `https://api-m.sandbox.paypal.com` with a unique `PayPal-Request-Id` header for idempotency.
5. The result returns to the model for next-turn reflection or final user synthesis.

---

## 3. Reflection on Mistakes & Corrective Actions

During integration, four failure modes occurred and were corrected:

### Mistake 1: Mock Simulation Drift
- **Root Cause**: When credentials were placeholder strings, `getPayPalAccessToken()` caught the HTTP 401 error and silently generated `MOCK_SANDBOX_TOKEN` alongside randomized fake IDs (`ORD-SANDBOX-...`, `INV-...`).
- **Correction**: All mock fallbacks were deleted. The system now throws `PayPalConfigurationError` or `PayPalApiError` immediately. Zero simulation is enforced in `AGENTS.md` and the verification skills.

### Mistake 2: Missing Environment Loading in Standalone Scripts
- **Root Cause**: Node.js ES Modules do not automatically read `.env` into `process.env`. CLI tools like `control-syndicate.mjs doctor` returned `MISSING_CREDENTIALS` false negatives.
- **Correction**: Built `src/lib/env.js` using native `fs.readFileSync` to parse `.env` at boot across all standalone scripts and background servers.

### Mistake 3: Hand-Rolled Recursive Model Fetch Loops
- **Root Cause**: The harness previously executed custom recursive `fetch()` loops against Ollama `/api/chat`. This produced brittle tool schema parsing and manual state serialization.
- **Correction**: Standardized on Vercel AI SDK `generateText({ maxSteps: 6 })` and `@ai-sdk/openai` targeting Ollama's OpenAI-compatible endpoint (`/v1`).

### Mistake 4: Missing Fallback on Draft Invoice Numbers
- **Root Cause**: The PayPal Invoicing v2 draft endpoint assigns `id` (`INV2-XXXX-...`) immediately but leaves `detail.invoice_number` empty unless finalized. Tests asserting on `invoiceNumber` failed.
- **Correction**: Assigned `invoiceNumber: invoiceData.detail?.invoice_number || invoiceNumber || invoiceId`.

---

## 4. How to Verify Live PayPal Sandbox Connectivity

Run the following commands to exercise the live sandbox rails:

```bash
# 1. Environment Doctor: Verifies live OAuth2 handshake with PayPal
node .cursor/skills/verify-syndicate/control-syndicate.mjs doctor

# 2. PayPal Agent Toolkit Verification: Confirms 47 registered tools
node scripts/test-agent-toolkit.mjs

# 3. Live Order Authorization: Generates a real Orders v2 authorization on PayPal Sandbox
node --test test/paypal-bridge.test.js

# 4. Master Health Gate: Runs linter, feature map check, and unit tests
npm run check
```

---

## 5. Upcoming Integration: Kernel.sh Cloud Browser Agents

Wholeshare requires real wholesale supplier data to form purchasing coalitions. Small businesses cannot rely on static catalogs.

### 5.1 The Role of Kernel.sh
Kernel.sh (`onkernel.com`) provides sandboxed cloud Chromium instances for AI agents:
1. **Live Tier Scraping**: A headless cloud browser navigates B2B wholesale portals (for example, restaurant supply distributors) to extract real MOQ price breaks.
2. **Cryptographic Proofs**: Kernel captures full-page screenshot proofs and DOM state, which Wholeshare hashes and stores in PostgreSQL (`audit_events`).
3. **Automated Mandate Submission**: The Kernel agent posts the verified tier data as an HMAC-signed ACP mandate to `POST /api/v1/gateway/ingress`.

### 5.2 Architecture Sequence

```
[Wholeshare Clan Orchestrator] ──> 1. Launch Sourcing Task ──> [Kernel.sh Cloud Browser]
                                                                        │
                                                               2. Navigate B2B Supplier Portal
                                                               3. Solve Anti-Bot Challenges
                                                               4. Extract MOQ Price Tiers
                                                               5. Capture Proof Screenshot
                                                                        │
[Wholeshare API Gateway] <── 6. POST /api/v1/gateway/ingress <─────────┘
 (HMAC Signature Verified)
         │
         ▼
[PostgreSQL Ledger] ──> 7. Update Wholesale Catalog Tiers
         │
         ▼
[Local Qwen 3.5 9B] ──> 8. Calculate Clan Savings & Execute PayPal Escrow
```

### 5.3 Implementation Plan for Kernel.sh
1. Install `@onkernel/sdk` into `package.json`.
2. Configure `KERNEL_API_KEY` in `.env`.
3. Create `src/lib/kernel-bridge.js` to dispatch cloud browser sessions and retrieve scraped price tables.
4. Add `discover_wholesale_supplier_tiers` tool to `src/lib/tool-registry.js`.
5. Write `test/kernel-bridge.test.js` to verify cloud browser scraping and screenshot ingestion.
