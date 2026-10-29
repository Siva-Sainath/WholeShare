#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

const ROOT_DIR = process.cwd();
const DIAGRAMS_DIR = path.join(ROOT_DIR, "diagrams");
const DOCS_DIAGRAMS_DIR = path.join(ROOT_DIR, "docs/diagrams");
fs.mkdirSync(DIAGRAMS_DIR, { recursive: true });
fs.mkdirSync(DOCS_DIAGRAMS_DIR, { recursive: true });

console.log("Generating Wholeshare Dataset-to-Application Feature Map...");

// 1. Generate .tldr (tldraw format JSON)
const tldrContent = {
  tldrawFileFormatVersion: 1,
  schema: {
    schemaVersion: 2,
    sequences: {
      "com.tldraw.store": 4,
      "com.tldraw.shape": 4,
      "com.tldraw.shape.geo": 9,
      "com.tldraw.shape.arrow": 5
    }
  },
  records: [
    {
      id: "shape:title",
      typeName: "shape",
      type: "geo",
      x: 100,
      y: 40,
      props: {
        geo: "rectangle",
        w: 1400,
        h: 90,
        color: "blue",
        fill: "solid",
        text: "Wholeshare: 2.14M Dataset-to-Application Feature Matrix\nMapping 21 Global & India-Specific Datasets to Core Fintech Modules",
        size: "m"
      }
    },
    // Cluster 1
    {
      id: "shape:c1_data",
      typeName: "shape",
      type: "geo",
      x: 100,
      y: 160,
      props: {
        geo: "rectangle",
        w: 680,
        h: 210,
        color: "green",
        fill: "semi",
        text: "1. SME ONBOARDING & FIRMOGRAPHICS (913k Records)\n- India UDYAM MSME Registry (765 districts)\n- US SBA National Loans (899k businesses)\n- Nooxus Verified Entities (11.7k companies)\n- SBA Underwriting Case Studies (2.1k loans)",
        size: "s"
      }
    },
    {
      id: "shape:c1_app",
      typeName: "shape",
      type: "geo",
      x: 820,
      y: 160,
      props: {
        geo: "rectangle",
        w: 680,
        h: 210,
        color: "green",
        fill: "pattern",
        text: "WEB MODULE: Zone 2 Syndicate Lobby & Business Induction\n- src/lib/business-induction.js\n- Automatic BOM extraction & spend-cap limits\n- ACP Shared Payment Token issuance\n- System 1 (Laya) Fast Entity Classification",
        size: "s"
      }
    },
    // Cluster 2
    {
      id: "shape:c2_data",
      typeName: "shape",
      type: "geo",
      x: 100,
      y: 400,
      props: {
        geo: "rectangle",
        w: 680,
        h: 210,
        color: "yellow",
        fill: "semi",
        text: "2. GPO BULK PRICING & TENDER SPECIFICATIONS (514k Records)\n- EU TED Public Procurement Tenders (510k notices)\n- World Bank Corporate Awards (2.3k contracts)\n- Kraljic Sourcing Matrix (1k commodities)\n- India AP Markfed Cooperative Procurement (97 events)",
        size: "s"
      }
    },
    {
      id: "shape:c2_app",
      typeName: "shape",
      type: "geo",
      x: 820,
      y: 400,
      props: {
        geo: "rectangle",
        w: 680,
        h: 210,
        color: "yellow",
        fill: "pattern",
        text: "WEB MODULE: Zone 1 Discovery & Volume Tier Curve\n- src/lib/volume-pricing.js & clan-lobby.js\n- Minimum Order Quantity (MOQ) pooling\n- Dynamic margin discount calculation (28% off)\n- System 2 (Qwen 9B) Multi-Party Negotiation",
        size: "s"
      }
    },
    // Cluster 3
    {
      id: "shape:c3_data",
      typeName: "shape",
      type: "geo",
      x: 100,
      y: 640,
      props: {
        geo: "rectangle",
        w: 680,
        h: 210,
        color: "orange",
        fill: "semi",
        text: "3. CROSS-BORDER TRADE & LOGISTICS RISK (688k Records)\n- India Import-Export Trade Census (498k records)\n- Harmonized System HS Codes (9.2k tariffs)\n- DataCo Global Supply Chain Orders (180k shipments)\n- Supply Chain Ontology QA (1.3k dialogues)",
        size: "s"
      }
    },
    {
      id: "shape:c3_app",
      typeName: "shape",
      type: "geo",
      x: 820,
      y: 640,
      props: {
        geo: "rectangle",
        w: 680,
        h: 210,
        color: "orange",
        fill: "pattern",
        text: "WEB MODULE: Zone 4 International Trade Corridors\n- src/lib/cross-border-escrow.js & tariff lookup\n- Incoterms customs clearance pre-check\n- Carrier late delivery risk probability scoring\n- Multi-milestone escrow condition dispatch",
        size: "s"
      }
    },
    // Cluster 4
    {
      id: "shape:c4_data",
      typeName: "shape",
      type: "geo",
      x: 100,
      y: 880,
      props: {
        geo: "rectangle",
        w: 680,
        h: 210,
        color: "blue",
        fill: "semi",
        text: "4. THREE-WAY MATCH & PAYPAL ESCROW (16k Records)\n- B2B Procure-to-Pay Lifecycle Relational DB (4.5k rows)\n- FinQA Multi-Step Financial Math (6.2k programs)\n- Hermes Function Calling (5.2k tool episodes)\n- CORD-v2 Invoice Line-Item OCR (100 receipts)",
        size: "s"
      }
    },
    {
      id: "shape:c4_app",
      typeName: "shape",
      type: "geo",
      x: 820,
      y: 880,
      props: {
        geo: "rectangle",
        w: 680,
        h: 210,
        color: "blue",
        fill: "pattern",
        text: "WEB MODULE: Zone 4 AG Grid Financial Ledger & PayPal Bridge\n- src/lib/paypal-toolkit.js & orders-v2.js\n- Orders v2 Soft Holds (intent: AUTHORIZE)\n- Three-way match (PO + Receipt + Carrier Webhook)\n- Batch atomic capture & Invoicing v2 QR generation",
        size: "s"
      }
    },
    // Cluster 5
    {
      id: "shape:c5_data",
      typeName: "shape",
      type: "geo",
      x: 100,
      y: 1120,
      props: {
        geo: "rectangle",
        w: 680,
        h: 210,
        color: "red",
        fill: "semi",
        text: "5. DISPUTES, CONTRACTS & RISK MITIGATION (6.9k Records)\n- SEC EDGAR Form 10-K Supplier Risk (2.2k filings)\n- TAT-QA Hybrid Table-Text Statement Math (2.2k rows)\n- CFPB Payment Disputes & Resolutions (1k complaints)\n- Atticus CUAD Commercial Contract Clauses (510 agreements)\n- Enterprise Procurement KPI Defect Metrics (777 orders)",
        size: "s"
      }
    },
    {
      id: "shape:c5_app",
      typeName: "shape",
      type: "geo",
      x: 820,
      y: 1120,
      props: {
        geo: "rectangle",
        w: 680,
        h: 210,
        color: "red",
        fill: "pattern",
        text: "WEB MODULE: Zone 1 Dispute God-Mode & Mediation Engine\n- src/web/routes/disputes.js & apimatic-disputes.js\n- Automated damage inspection & pro-rata clawbacks\n- 41 legal clause boundary enforcement\n- Zero-float integer cents balance preservation",
        size: "s"
      }
    }
  ]
};

const tldrPath = path.join(DIAGRAMS_DIR, "06_dataset_application_feature_map.tldr");
fs.writeFileSync(tldrPath, JSON.stringify(tldrContent, null, 2), "utf-8");
console.log(`Saved tldraw document: ${tldrPath}`);

// 2. Generate HD HTML View
const htmlContent = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  * { box-sizing: border-box; }
  body {
    margin: 0; padding: 32px; background: #0b0f19;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    color: #f8fafc; width: 1600px;
  }
  .header {
    border-bottom: 2px solid #3b82f6; padding-bottom: 16px; margin-bottom: 24px;
    display: flex; justify-content: space-between; align-items: flex-end;
  }
  h1 { margin: 0; font-size: 22pt; font-weight: 800; color: #ffffff; }
  .subtitle { font-size: 11pt; color: #94a3b8; margin-top: 4px; }
  .badge { background: #1e3a8a; color: #93c5fd; padding: 4px 10px; border-radius: 4px; font-size: 9pt; font-weight: 700; border: 1px solid #3b82f6; }
  
  .matrix-grid { display: flex; flex-direction: column; gap: 16px; }
  .matrix-row { display: grid; grid-template-columns: 48% 4% 48%; align-items: stretch; }
  .box {
    background: #111827; border: 1px solid #1f2937; border-radius: 8px; padding: 18px;
    box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.4);
  }
  .arrow-col { display: flex; align-items: center; justify-content: center; font-size: 20pt; color: #3b82f6; }
  
  .c1 { border-left: 4px solid #10b981; }
  .c2 { border-left: 4px solid #f59e0b; }
  .c3 { border-left: 4px solid #f97316; }
  .c4 { border-left: 4px solid #3b82f6; }
  .c5 { border-left: 4px solid #ec4899; }
  
  .box-title { font-weight: 800; font-size: 11pt; margin-bottom: 8px; display: flex; justify-content: space-between; }
  .tag { font-size: 7.5pt; padding: 2px 6px; border-radius: 3px; font-weight: 700; text-transform: uppercase; }
  .tag-data { background: #1f2937; color: #94a3b8; border: 1px solid #374151; }
  .tag-app { background: #0369a1; color: #e0f2fe; }
  .content { font-size: 9pt; color: #cbd5e1; line-height: 1.5; }
  .code { background: #0f172a; color: #38bdf8; font-family: ui-monospace, monospace; font-size: 8pt; padding: 2px 4px; border-radius: 3px; }
  .stat { color: #4ade80; font-weight: 700; }
</style>
</head>
<body>
<div class="header">
  <div>
    <h1>Wholeshare: 2.14M Dataset-to-Application Complement Matrix</h1>
    <div class="subtitle">Complete mapping of 21 verified global & India datasets to web modules, state machines, and AI engines</div>
  </div>
  <div>
    <span class="badge">2,140,053 Authentic Records | 796.87 MB</span>
  </div>
</div>

<div class="matrix-grid">
  <!-- ROW 1 -->
  <div class="matrix-row">
    <div class="box c1">
      <div class="box-title">
        <span style="color:#10b981;">1. SME ONBOARDING & FIRMOGRAPHICS</span>
        <span class="tag tag-data">913,765 Real Records</span>
      </div>
      <div class="content">
        &bull; <strong>India UDYAM MSME Registry:</strong> 765 districts, state-level enterprise density by micro, small, and medium tiers.<br>
        &bull; <strong>US SBA National Loans:</strong> 899,164 commercial firms, NAICS sector codes, headcounts, credit lines, and defaults.<br>
        &bull; <strong>Nooxus Verified Global Entities:</strong> 11,734 enterprise identities, registration numbers, and verification logs.<br>
        &bull; <strong>SBA Underwriting Case Studies:</strong> 2,102 small business bank risk evaluations.
      </div>
    </div>
    <div class="arrow-col">&rarr;</div>
    <div class="box c1">
      <div class="box-title">
        <span style="color:#10b981;">WEB MODULE: Zone 2 Syndicate Lobby & Business Induction</span>
        <span class="tag tag-app">Frontend + Core Logic</span>
      </div>
      <div class="content">
        &bull; <span class="code">src/lib/business-induction.js</span>: Auto-induces SME BOM profiles from raw trade lines.<br>
        &bull; <span class="code">src/lib/acp-tokens.js</span>: Issues cryptographically signed ACP Shared Payment Tokens.<br>
        &bull; <strong>System 1 (Laya) Role:</strong> Sub-millisecond firmographic classification and spend-cap boundary enforcement.<br>
        &bull; <strong>User POV:</strong> Natural language business registration drawer with instant NAICS detection.
      </div>
    </div>
  </div>

  <!-- ROW 2 -->
  <div class="matrix-row">
    <div class="box c2">
      <div class="box-title">
        <span style="color:#f59e0b;">2. GPO BULK PRICING & TENDER SPECIFICATIONS</span>
        <span class="tag tag-data">513,410 Real Records</span>
      </div>
      <div class="content">
        &bull; <strong>EU TED Public Procurement Tenders:</strong> 510,016 public tender notices, volume contracts, and CPV codes.<br>
        &bull; <strong>World Bank Corporate Contract Awards:</strong> 2,297 multinational corporate procurement orders and selection methods.<br>
        &bull; <strong>Kraljic Sourcing Strategy Matrix:</strong> 1,000 commodities mapped by supply risk and profit impact.<br>
        &bull; <strong>India AP Markfed Cooperative Procurement:</strong> 97 state seasonal agricultural pooling transactions.
      </div>
    </div>
    <div class="arrow-col">&rarr;</div>
    <div class="box c2">
      <div class="box-title">
        <span style="color:#f59e0b;">WEB MODULE: Zone 1 Discovery & Volume Tier Curve</span>
        <span class="tag tag-app">Pricing Engine + Negotiation</span>
      </div>
      <div class="content">
        &bull; <span class="code">src/lib/volume-pricing.js</span>: Mathematical tier curves yielding up to 28% wholesale savings.<br>
        &bull; <span class="code">src/lib/coalition-fsm.js</span>: Advances syndicate from PLEDGING to MATCHED upon MOQ fill.<br>
        &bull; <strong>System 2 (Qwen 9B) Role:</strong> Multi-party game-theoretic negotiation and pro-rata quota allocation.<br>
        &bull; <strong>User POV:</strong> Interactive tier progress ring showing real-time clan pooling progress.
      </div>
    </div>
  </div>

  <!-- ROW 3 -->
  <div class="matrix-row">
    <div class="box c3">
      <div class="box-title">
        <span style="color:#f97316;">3. CROSS-BORDER TRADE & LOGISTICS RISK</span>
        <span class="tag tag-data">689,018 Real Records</span>
      </div>
      <div class="content">
        &bull; <strong>India Import-Export Trade Census:</strong> 498,953 cross-border trade transactions by commodity and country.<br>
        &bull; <strong>Harmonized System (HS) Codes:</strong> 9,207 international customs commodity tariff classifications.<br>
        &bull; <strong>DataCo Global Supply Chain:</strong> 180,519 multi-tier commercial orders, scheduled vs real days, late delivery risk.<br>
        &bull; <strong>Supply Chain Ontology QA:</strong> 1,339 structured dialogues on multi-echelon vendor dependencies.
      </div>
    </div>
    <div class="arrow-col">&rarr;</div>
    <div class="box c3">
      <div class="box-title">
        <span style="color:#f97316;">WEB MODULE: Zone 4 International Trade Corridors</span>
        <span class="tag tag-app">Customs & Logistics</span>
      </div>
      <div class="content">
        &bull; <span class="code">src/lib/cross-border-escrow.js</span>: Incoterms duty calculation and customs pre-clearance.<br>
        &bull; <strong>Carrier Risk Predictor:</strong> Calculates freight buffer and transit delay probabilities.<br>
        &bull; <strong>System 2 (Qwen 9B) Role:</strong> Evaluates bills of lading and cross-border regulatory compliance.<br>
        &bull; <strong>User POV:</strong> Interactive trade corridor map linking buyers in Tiruppur, Shenzhen, and Naivasha.
      </div>
    </div>
  </div>

  <!-- ROW 4 -->
  <div class="matrix-row">
    <div class="box c4">
      <div class="box-title">
        <span style="color:#3b82f6;">4. THREE-WAY MATCH & PAYPAL ESCROW</span>
        <span class="tag tag-data">16,114 Real Records</span>
      </div>
      <div class="content">
        &bull; <strong>B2B Procure-to-Pay Lifecycle Relational DB:</strong> 4,554 records linking POs, goods receipts, invoices, payments.<br>
        &bull; <strong>FinQA Multi-Step Financial Math:</strong> 6,251 numerical arithmetic programs from audited 10-K filings.<br>
        &bull; <strong>Hermes Function Calling:</strong> 5,209 tool calling dialogues with typed JSON schemas.<br>
        &bull; <strong>CORD-v2 Invoice Line-Item OCR:</strong> 100 scanned receipts with bounding boxes and line items.
      </div>
    </div>
    <div class="arrow-col">&rarr;</div>
    <div class="box c4">
      <div class="box-title">
        <span style="color:#3b82f6;">WEB MODULE: Zone 4 AG Grid Financial Ledger & PayPal Bridge</span>
        <span class="tag tag-app">Settlement Core</span>
      </div>
      <div class="content">
        &bull; <span class="code">src/lib/paypal-toolkit.js</span>: Orders v2 soft holds (<span class="code">intent: AUTHORIZE</span>).<br>
        &bull; <strong>Three-Way Match Verification:</strong> Reconciles PO, physical goods receipt, and carrier webhook.<br>
        &bull; <strong>System 1 (Laya) Role:</strong> Instant tool dispatch and floating-point interceptor validation.<br>
        &bull; <strong>User POV:</strong> AG Grid ledger with cell flashing upon soft-hold authorization and batch capture.
      </div>
    </div>
  </div>

  <!-- ROW 5 -->
  <div class="matrix-row">
    <div class="box c5">
      <div class="box-title">
        <span style="color:#ec4899;">5. DISPUTES, CONTRACTS & RISK MITIGATION</span>
        <span class="tag tag-data">7,746 Real Records</span>
      </div>
      <div class="content">
        &bull; <strong>SEC EDGAR Form 10-K Supplier Risk:</strong> 2,252 corporate disclosures of single-source supplier dependencies.<br>
        &bull; <strong>TAT-QA Hybrid Table-Text Statement Math:</strong> 2,207 numerical comparison problems across financial statements.<br>
        &bull; <strong>CFPB Financial Payment Disputes:</strong> 1,000 billing errors, unauthorized debits, and mediation resolutions.<br>
        &bull; <strong>Atticus CUAD Commercial Contracts:</strong> 510 agreements annotated with 41 escrow/liability clauses.<br>
        &bull; <strong>Enterprise Procurement KPI Analysis:</strong> 777 orders with defect rates and delivery delay days.
      </div>
    </div>
    <div class="arrow-col">&rarr;</div>
    <div class="box c5">
      <div class="box-title">
        <span style="color:#ec4899;">WEB MODULE: Zone 1 Dispute God-Mode & Mediation Engine</span>
        <span class="tag tag-app">Arbitration Engine</span>
      </div>
      <div class="content">
        &bull; <span class="code">src/web/routes/disputes.js</span>: APIMatic pro-rata dispute mediation and automated refunds.<br>
        &bull; <strong>Clause Boundary Interceptor:</strong> Enforces liquidated damages and maximum liability limits.<br>
        &bull; <strong>System 2 (Qwen 9B) Role:</strong> Arbitrates contested shipments and constructs pro-rata refund distributions.<br>
        &bull; <strong>User POV:</strong> One-click dispute mediation modal with live recalculation of net member payouts.
      </div>
    </div>
  </div>
</div>
</body>
</html>`;

const htmlPath = path.join(DIAGRAMS_DIR, "06_dataset_application_feature_map.html");
fs.writeFileSync(htmlPath, htmlContent, "utf-8");
console.log(`Saved HTML matrix: ${htmlPath}`);

// 3. Render High-Def PNG via Chrome Headless
const pngPath = path.join(DIAGRAMS_DIR, "06_dataset_application_feature_map.png");
const docsPngPath = path.join(DOCS_DIAGRAMS_DIR, "06_dataset_application_feature_map.png");
try {
  execSync(
    `"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless --disable-gpu --default-background-color=0b0f19 --run-all-compositor-stages-before-draw --virtual-time-budget=6000 --window-size=1600,1280 --screenshot="${pngPath}" "${htmlPath}"`,
    { stdio: "inherit" }
  );
  fs.copyFileSync(pngPath, docsPngPath);
  console.log(`Rendered HD PNG: ${pngPath}`);
} catch (e) {
  console.log(`Chrome headless screenshot skipped: ${e.message}`);
}
