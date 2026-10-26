# Wholeshare: Autonomous B2B Group Purchasing & Multiparty Escrow Platform

> **Built on PayPal for Business for the PayPal AI Hackathon 2026**  
> *Sponsor Tracks: AG Grid Financial Command Center | APIMatic Typed SDKs | Kernel Cloud Browsers | Render IaC | pstack Autonomous Verification*

---

## 1. Quick Tutorial: 1-Click Verification Walkthrough (Learning by Doing)

Follow these steps to launch the system, inspect dependencies, seed deterministic demo data, and simulate the complete 4-stage lifecycle:

```bash
# Clone and enter directory
cd /Users/siva/.gemini/antigravity-ide/Paypal_project

# Step 1: Health check across runtime, credentials, and security guards
node .cursor/skills/verify-syndicate/control-syndicate.mjs doctor

# Step 2: Seed deterministic test state (3 SME Personas + 2 Clans + Scraped Wholesale Tiers)
node .cursor/skills/verify-syndicate/control-syndicate.mjs seed-demo --reset

# Step 3: Spawn a new SME Personal Agent with strict budget constraints
node .cursor/skills/verify-syndicate/control-syndicate.mjs spawn-sme \
  --name "Austin Artisan Bakery" \
  --sku "organic-flour-50lb" \
  --qty 15 \
  --max-usd 450

# Step 4: Drive A2A matchmaking until Clan reaches 100% MOQ unlock
node .cursor/skills/verify-syndicate/control-syndicate.mjs match-clan \
  --sku "organic-flour-50lb" \
  --simulate-agents 3

# Step 5: Execute PayPal Sandbox Order Authorization & Atomic Batch Capture
node .cursor/skills/verify-syndicate/control-syndicate.mjs lock-escrow \
  --clan-id "clan_flour_01" \
  --dry-run false

# Step 6: Simulate damaged delivery and APIMatic A2A pro-rata dispute refund
node .cursor/skills/verify-syndicate/control-syndicate.mjs trigger-dispute \
  --clan-id "clan_flour_01" \
  --sme-index 2 \
  --damage-pct 25
```

---

## 2. How-To Guides (Solving Real Operational Tasks)

### How to Connect an External Grok Bot or Telegram Agent
External agents interact with Wholeshare through signed HMAC-SHA256 webhooks:
1. Generate an HMAC secret in `.env`: `SYNDICATE_HMAC_SECRET="<hex-secret>"`.
2. Send a `POST` request to `/api/sme/spawn` with the header:
   `X-Syndicate-HMAC-SHA256: hmac_sha256(payload, secret)` and `X-Syndicate-Timestamp: <unix_epoch>`.
3. If payload timestamp is within 300 seconds, the agent is enrolled and allocated a personal policy manifest in PostgreSQL.

### How to Import the Master Architecture Diagram into Excalidraw or tldraw
1. Open [`docs/SYNDICATE_SPEC.md`](docs/SYNDICATE_SPEC.md).
2. Copy the Mermaid code block in Section 2.
3. Open [Excalidraw](https://excalidraw.com/), click `More Tools` &rarr; `Mermaid to Excalidraw`, or paste directly into [tldraw](https://tldraw.com/).

### How to Inspect and Regenerate the Master Blueprint PDF
Run the headless Chrome build script to regenerate the print-ready specification:
```bash
node scripts/generate-pdf.mjs
```
The output file is written to [`docs/SYNDICATE_SPEC.pdf`](docs/SYNDICATE_SPEC.pdf).

---

## 3. Reference: Machinery, APIs & Data Structures

### PayPal Business Primitives Chained
* **Invoicing v2 (`create_invoice`, `generate_invoice_qr_code`):** Emits human-auditable invoices and scannable QR codes for step-up authentication.
* **Orders v2 (`intent: "AUTHORIZE"`):** Places soft holds on member funds without deducting capital upfront.
* **Orders v2 Capture (`pay_order`):** Executes simultaneous, atomic fund transfers only when 100% of Clan members authorize.
* **Shipment Tracking v1 (`create_shipment_tracking`):** Verifies carrier delivery timestamps to bound the dispute filing window.
* **Customer Disputes v1 (`provide_evidence`, `make_offer`, `create_refund`):** Mediates partial damaged-goods claims autonomously.

### Verification CLI Commands (`control-syndicate.mjs`)
* `doctor`: Asserts runtime, database connection, PayPal Sandbox credentials, and port availability.
* `seed-demo`: Loads reproducible fixtures with `--reset` support.
* `lock-escrow`: Executes PayPal authorizations and batch capture with `--dry-run` validation.
* `trigger-dispute`: Verifies delivery timestamp, submits damage photo hash, and returns refund transaction ID.
* `snapshot`: Emits ARIA accessibility tree of the target component (e.g. `ag-grid-ledger`).

---

## 4. Explanation: Design Rationale, Anti-Fraud & pstack Philosophy

### Why "Clash of Clans" Style Group Purchasing?
Individual SMEs lack volume for wholesale pricing. By treating purchasing syndicates like cooperative "Clans", demand is pooled organically. Personal Agents negotiate pledges, verify live wholesale tiers via Kernel cloud browsers, and execute conditional commitments without counterparty default risk.

### The 6-Layer FinTech Security & Anti-Fraud Architecture
1. **Prompt-Injection Firewall:** Natural language LLM prompts never reach PayPal APIs directly; a deterministic TypeScript policy sandwich enforces mathematical limits.
2. **Sybil & Collusion Defense:** Every participant must hold a verified PayPal KYB account with signed authorization before pledges count toward thresholds.
3. **Cryptographic Webhook Verification:** Full validation of PayPal transmission signatures and HMAC headers.
4. **Deterministic Idempotency:** Header `PayPal-Request-Id: hash(clan_id + sme_id + stage)` prevents duplicate financial mutations.
5. **Multimodal Tamper Detection:** Perceptual photo hashing and carrier delivery verification prevent fabricated damage claims.
6. **Human-in-the-Loop Step-Up:** Pledges above auto-spend caps require scanning a generated PayPal Invoice QR code.

### The pstack Engineering Philosophy
This project was designed, scaffolded, and tested using Lauren (`@poteto`)'s `pstack` methodology. Every component adheres to:
* **"Verification is All You Need":** Automated verification scripts eliminate human bottlenecks.
* **"Build the Lever":** The `control-syndicate.mjs` CLI provides deep, composable module control.
* **Materialized Memory:** The [Feature Map](.cursor/skills/verify-syndicate/references/features/README.md) catalog saves LLM tokens and guides navigation.
* **Prototyping over Abstract Planning:** Real code, switchers, and timing measurements answer questions faster than theoretical debates.
