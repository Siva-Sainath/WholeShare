# Wholeshare: Autonomous B2B Group Purchasing and Multiparty Escrow Platform

Wholeshare is an autonomous agentic commerce platform built on PayPal for Business. It empowers independent small and medium enterprises (SMEs) to pool commercial demand, negotiate wholesale volume tier discounts, and lock multiparty escrow commitments with zero counterparty default risk.

---

## 1. The Core Problem: Small Business Procurement Inequality

Independent bakeries, coffee roasters, craft breweries, and boutique retailers face structural volume disadvantages. 

An artisan bakery purchasing 20 bags of organic flour pays $34.00 per bag. An industrial bread factory purchasing a full truckload of 500 bags pays $24.80 per bag for the exact same commodity. Over a single year, this pricing spread costs a small bakery more than $16,500 in working capital.

Traditional group purchasing organizations (GPOs) fail small businesses because:
1. **Counterparty Default Risk**: If one member defaults on payment after an order is placed, the remaining members or the organizer must cover the loss.
2. **Locked Working Capital**: Small businesses cannot afford to wire cash into escrow weeks before delivery.
3. **Manual Coordination Friction**: Tracking purchase orders, specification requirements, and delivery milestones across independent businesses requires prohibitive administrative effort.

---

## 2. The Solution: Autonomous Syndicates on Native PayPal Primitives

Wholeshare solves collective procurement through autonomous agents and native PayPal financial primitives chained together.

```
+-------------------------------------------------------------------------------------------------+
|                                     Wholeshare Platform Flow                                    |
|                                                                                                 |
|   [ Ingestion Pipeline ] ---> [ Autonomous Negotiation ] ---> [ Zero-Default PayPal Escrow ]    |
|   - Invoices & POs             - Demand Aggregation           - Orders v2 Soft Holds            |
|   - Spec Sheets (Protein %)    - Volume Discount Tiers        - Atomic Batch Capture            |
|   - Google Drive Import        - ACP Shared Tokens            - Invoicing v2 QR Step-Up         |
|   - Instinct Memory Graph      - Policy Sandwich Interceptor  - Shipment Tracking Verification  |
+-------------------------------------------------------------------------------------------------+
```

### Chained PayPal Financial Rails

1. **PayPal Orders v2 Soft Escrow Holds (`intent: "AUTHORIZE"`)**:
   Members authorize their individual allocation through PayPal Orders v2 with authorization intent. Funds remain in the buyer account for up to 29 days without cash deduction until the coalition reaches 100 percent of its target volume.

2. **Atomic Batch Capture**:
   When the target volume is reached and supplier terms are locked, Wholeshare triggers atomic batch captures across all authorizations. If any single authorization fails, no funds are captured.

3. **Invoicing v2 and QR Code Step-Up KYC**:
   When an autonomous agent allocates spend exceeding a buyer pre-set threshold, Wholeshare automatically generates a PayPal Invoicing v2 draft with a base64 QR code. The business owner must scan and authorize the transaction on their mobile device before spend locks.

4. **Shipment Tracking and Escrow Settlement**:
   Wholeshare registers carrier tracking numbers with the PayPal Trackers API. Escrow releases to the wholesale supplier only after the carrier confirms package transit and delivery.

5. **Customer Dispute Mediation**:
   If an SME receives damaged goods, Wholeshare calculates pro-rata refund claims and coordinates resolution through the PayPal Customer Disputes API.

---

## 3. Product Architecture and Core Subsystems

### A. Business Data and Document Ingestion Pipeline
Wholeshare establishes each buyer procurement baseline from real operational records:
- **Multi-Format Ingress**: Drag-and-drop web dropzone and API routes accepting PDF invoices, scanned receipts, CSV price sheets, and JSON order histories.
- **Cloud Connectors**: Direct integration with Google Drive using OAuth2 tokens and file identifiers.
- **Multimodal Extraction**: Layout-aware table extraction using Docling and Unstructured, normalizing raw vendor line items into canonical commodity SKUs and exact integer cents.
- **Instinct Memory Graph**: Indexes procurement baselines into Git-tracked Markdown entity files under `data/memory/entities/`. Agents query historical moving average prices, delivery cadences, and protein specifications.

### B. Agentic Commerce Protocol (ACP) and Security Interceptor
All agent operations execute inside mathematical security boundaries:
- **Shared Payment Tokens**: Delegated buyer mandates issued as HMAC-SHA256 signed tokens binding immutable buyer IDs, target SKUs, and spend caps.
- **Policy Sandwich Interceptor**: Pure TypeScript policy engine enforcing 10 non-negotiable financial invariants prior to any PayPal API call. It rejects floating-point cents, negative volumes, and direct capture intents.
- **Token Bucket Rate Limiting Gateway**: Protects agent reasoning endpoints against denial-of-service and compute exhaustion.

### C. Financial Command Center and Interactive Workbench
The browser interface provides real-time visibility into all commercial actions:
- **AG Grid Financial Ledger**: Displays active syndicates, member pledges, escrow states, and PayPal transaction IDs with cell flash animations.
- **One-Shot Agent Workbench**: Interactive console for driving the local Qwen 3.5 9B model across full commerce cycles, spend cap tests, and carrier tracking.
- **Server-Sent Events (SSE)**: Live telemetry stream broadcasting FSM state transitions and transaction confirmations.

---

## 4. Quickstart: Running Wholeshare Locally

### Prerequisites
- Node.js version 20 or higher.
- PayPal Developer account with Sandbox credentials.
- Local Ollama running `qwen3.5:9b` (optional for local inference).

### Setup and Verification

1. Clone the repository and install dependencies:
```bash
git clone https://github.com/Siva-Sainath/WholeShare.git
cd WholeShare
npm install
```

2. Configure environment variables:
```bash
cp .env.example .env
```
Edit `.env` and provide your PayPal Sandbox Client ID and Secret:
```ini
PAYPAL_MODE=sandbox
PAYPAL_CLIENT_ID="your_sandbox_client_id"
PAYPAL_CLIENT_SECRET="your_sandbox_client_secret"
```

3. Run the environment doctor check:
```bash
npm run doctor
```

4. Run the automated test suite (81 tests executing against live PayPal Sandbox):
```bash
npm test
```

5. Start the web command center:
```bash
npm run dev
```
Open `http://localhost:3000` in your browser.

---

## 5. API Reference and Route Directory

### Business Data Ingestion
- `POST /api/v1/ingest/upload`: Upload PDF, CSV, or JSON invoice records.
- `POST /api/v1/ingest/google-drive`: Import procurement contracts directly from Google Drive.
- `POST /api/v1/ingest/agent-dispatch`: Cryptographically signed HMAC ingress for external AI agents.
- `GET /api/v1/ingest/documents`: Retrieve ingested records and historical pricing baselines.

### Coalition Negotiation and Escrow Execution
- `POST /api/v1/sme/spawn`: Onboard an SME with an ACP mandate and spend cap.
- `POST /api/v1/coalition/negotiate`: Run price discovery and volume discount calculations.
- `POST /api/v1/coalition/lock`: Authorize member escrow soft holds via PayPal Orders v2.
- `POST /api/v1/autopilot`: Execute a complete autonomous procurement cycle with local Qwen 3.5 9B.

### Telemetry and Webhooks
- `GET /api/v1/events`: Server-Sent Events stream for real-time frontend telemetry.
- `GET /api/v1/ledger`: Query active syndicate coalitions and member escrow statuses.
- `POST /api/v1/paypal/webhook`: Ingest dispute and payment capture events from PayPal.
- `GET /.well-known/agentic-commerce.json`: Agentic Commerce Protocol discovery manifest.

---

## 6. Verification and Quality Standards

Wholeshare enforces strict automated quality gates:
- **Zero Simulation Standard**: All PayPal Developer API operations execute against live sandbox endpoints with zero mocked tokens.
- **Feature Map Synchronization**: 20 feature maps cataloged under `.cursor/skills/` and `.agents/skills/`. Verified via `npm run lint:features`.
- **Code Linter**: Codebase verified against deslop standards via `npm run lint`.
