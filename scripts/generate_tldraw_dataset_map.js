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

function createGeoShape(id, index, x, y, w, h, text, color, fill) {
  return {
    id,
    typeName: "shape",
    type: "geo",
    x,
    y,
    rotation: 0,
    index,
    parentId: "page:page",
    isLocked: false,
    opacity: 1,
    meta: {},
    props: {
      w,
      h,
      geo: "rectangle",
      color,
      labelColor: "black",
      fill,
      dash: "draw",
      size: "s",
      font: "sans",
      text,
      align: "start",
      verticalAlign: "start",
      growY: 0,
      url: "",
      scale: 1
    }
  };
}

const records = [
  {
    gridSize: 10,
    name: "",
    meta: {},
    id: "document:document",
    typeName: "document"
  },
  {
    id: "page:page",
    name: "Page 1",
    index: "a1",
    typeName: "page",
    meta: {}
  },
  // Title
  createGeoShape(
    "shape:title",
    "a1",
    100,
    40,
    1400,
    90,
    "Wholeshare: 2.14M Dataset-to-Application Feature Matrix\nMapping 21 Global & India-Specific Datasets to Core Fintech Modules",
    "blue",
    "solid"
  ),
  // Cluster 1
  createGeoShape(
    "shape:c1_data",
    "a2",
    100,
    160,
    680,
    210,
    "1. SME ONBOARDING & FIRMOGRAPHICS (913k Records)\n- India UDYAM MSME Registry (765 districts)\n- US SBA National Loans (899k businesses)\n- Nooxus Verified Entities (11.7k companies)\n- SBA Underwriting Case Studies (2.1k loans)",
    "green",
    "semi"
  ),
  createGeoShape(
    "shape:c1_app",
    "a3",
    820,
    160,
    680,
    210,
    "WEB MODULE: Zone 2 Syndicate Lobby & Business Induction\n- src/lib/business-induction.js\n- Automatic BOM extraction & spend-cap limits\n- ACP Shared Payment Token issuance\n- System 1 (Laya) Fast Entity Classification",
    "green",
    "pattern"
  ),
  // Cluster 2
  createGeoShape(
    "shape:c2_data",
    "a4",
    100,
    400,
    680,
    210,
    "2. GPO BULK PRICING & TENDER SPECIFICATIONS (514k Records)\n- EU TED Public Procurement Tenders (510k notices)\n- World Bank Corporate Awards (2.3k contracts)\n- Kraljic Sourcing Matrix (1k commodities)\n- India AP Markfed Cooperative Procurement (97 events)",
    "yellow",
    "semi"
  ),
  createGeoShape(
    "shape:c2_app",
    "a5",
    820,
    400,
    680,
    210,
    "WEB MODULE: Zone 1 Discovery & Volume Tier Curve\n- src/lib/volume-pricing.js & clan-lobby.js\n- Minimum Order Quantity (MOQ) pooling\n- Dynamic margin discount calculation (28% off)\n- System 2 (Qwen 9B) Multi-Party Negotiation",
    "yellow",
    "pattern"
  ),
  // Cluster 3
  createGeoShape(
    "shape:c3_data",
    "a6",
    100,
    640,
    680,
    210,
    "3. CROSS-BORDER TRADE & LOGISTICS RISK (688k Records)\n- India Import-Export Trade Census (498k records)\n- Harmonized System HS Codes (9.2k tariffs)\n- DataCo Global Supply Chain Orders (180k shipments)\n- Supply Chain Ontology QA (1.3k dialogues)",
    "orange",
    "semi"
  ),
  createGeoShape(
    "shape:c3_app",
    "a7",
    820,
    640,
    680,
    210,
    "WEB MODULE: Zone 4 International Trade Corridors\n- src/lib/cross-border-escrow.js & tariff lookup\n- Incoterms customs clearance pre-check\n- Carrier late delivery risk probability scoring\n- Multi-milestone escrow condition dispatch",
    "orange",
    "pattern"
  ),
  // Cluster 4
  createGeoShape(
    "shape:c4_data",
    "a8",
    100,
    880,
    680,
    210,
    "4. THREE-WAY MATCH & PAYPAL ESCROW (16k Records)\n- B2B Procure-to-Pay Lifecycle Relational DB (4.5k rows)\n- FinQA Multi-Step Financial Math (6.2k programs)\n- Hermes Function Calling (5.2k tool episodes)\n- CORD-v2 Invoice Line-Item OCR (100 receipts)",
    "blue",
    "semi"
  ),
  createGeoShape(
    "shape:c4_app",
    "a9",
    820,
    880,
    680,
    210,
    "WEB MODULE: Zone 4 AG Grid Financial Ledger & PayPal Bridge\n- src/lib/paypal-toolkit.js & orders-v2.js\n- Orders v2 Soft Holds (intent: AUTHORIZE)\n- Three-way match (PO + Receipt + Carrier Webhook)\n- Batch atomic capture & Invoicing v2 QR generation",
    "blue",
    "pattern"
  ),
  // Cluster 5
  createGeoShape(
    "shape:c5_data",
    "b1",
    100,
    1120,
    680,
    210,
    "5. DISPUTES, CONTRACTS & RISK MITIGATION (6.9k Records)\n- SEC EDGAR Form 10-K Supplier Risk (2.2k filings)\n- TAT-QA Hybrid Table-Text Statement Math (2.2k rows)\n- CFPB Payment Disputes & Resolutions (1k complaints)\n- Atticus CUAD Commercial Contract Clauses (510 agreements)\n- Enterprise Procurement KPI Defect Metrics (777 orders)",
    "red",
    "semi"
  ),
  createGeoShape(
    "shape:c5_app",
    "b2",
    820,
    1120,
    680,
    210,
    "WEB MODULE: Zone 1 Dispute God-Mode & Mediation Engine\n- src/web/routes/disputes.js & apimatic-disputes.js\n- Automated damage inspection & pro-rata clawbacks\n- 41 legal clause boundary enforcement\n- Zero-float integer cents balance preservation",
    "red",
    "pattern"
  )
];

const tldrContent = {
  tldrawFileFormatVersion: 1,
  schema: {
    schemaVersion: 2,
    sequences: {
      "com.tldraw.store": 4,
      "com.tldraw.asset": 1,
      "com.tldraw.camera": 1,
      "com.tldraw.document": 2,
      "com.tldraw.instance": 25,
      "com.tldraw.instance_page_state": 5,
      "com.tldraw.page": 1,
      "com.tldraw.instance_presence": 6,
      "com.tldraw.pointer": 1,
      "com.tldraw.shape": 4,
      "com.tldraw.asset.bookmark": 2,
      "com.tldraw.asset.image": 5,
      "com.tldraw.asset.video": 5,
      "com.tldraw.shape.group": 0,
      "com.tldraw.shape.text": 2,
      "com.tldraw.shape.bookmark": 2,
      "com.tldraw.shape.draw": 2,
      "com.tldraw.shape.geo": 9,
      "com.tldraw.shape.image": 4,
      "com.tldraw.shape.line": 5,
      "com.tldraw.shape.frame": 0,
      "com.tldraw.shape.arrow": 5,
      "com.tldraw.shape.highlight": 1,
      "com.tldraw.shape.embed": 4,
      "com.tldraw.shape.video": 2,
      "com.tldraw.binding.arrow": 0
    }
  },
  records
};

const tldrPath = path.join(DIAGRAMS_DIR, "06_dataset_application_feature_map.tldr");
fs.writeFileSync(tldrPath, JSON.stringify(tldrContent, null, 2), "utf-8");
console.log(`Saved compliant tldraw document: ${tldrPath}`);

// Copy to docs/diagrams as well
const docsTldrPath = path.join(DOCS_DIAGRAMS_DIR, "06_dataset_application_feature_map.tldr");
fs.copyFileSync(tldrPath, docsTldrPath);

// Verify JSON validity
const parsed = JSON.parse(fs.readFileSync(tldrPath, "utf-8"));
console.log(`Validated ${parsed.records.length} records. Rotation verified: ${parsed.records.every(r => r.typeName !== "shape" || typeof r.rotation === "number")}`);
