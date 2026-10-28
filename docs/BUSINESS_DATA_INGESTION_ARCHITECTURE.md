# Wholeshare: Business Data Ingestion & Model Integration Architecture

This document defines the architecture, data schemas, and integration contracts for the Wholeshare Business Data Ingestion Pipeline. The pipeline ingests multi-format procurement records, normalizes messy invoice line items to canonical commodity SKUs, indexes intelligence into the Instinct Memory graph, and exposes standardized retrieval tools to local and cloud language models.

---

## 1. Executive Summary and Problem Statement

Small and medium-sized enterprises (SMEs) face steep volume disadvantages when purchasing wholesale raw ingredients. Commercial bakeries pay between $32.00 and $36.00 for single 50-pound bags of organic flour, whereas large industrial operations pay under $24.00 by purchasing in truckload quantities.

Wholeshare aggregates SME purchase volumes into syndicate coalitions to unlock wholesale volume tier discounts. Before Wholeshare can negotiate with suppliers or launch autonomous browser agents, it must establish each buyer's operational baseline:
- Current product specifications, protein grades, and organic certifications.
- Historical unit prices paid across past vendor invoices.
- Monthly consumption velocity and delivery cadences.
- Cash balance tolerances and approved autonomous spend ceilings.

The Business Data Ingestion Pipeline converts unstructured PDFs, scanned receipts, CSV price sheets, and Google Drive files into typed procurement entities without manual data entry.

---

## 2. Open-Source Ecosystem Evaluation & License Audit

Wholeshare leverages permissive open-source frameworks to avoid building document extractors and file transfer protocols from scratch.

### Open-Source Tool Matrix

| Solution | Maintainer / Project | License | Permissibility | Architectural Role in Wholeshare |
| :--- | :--- | :--- | :--- | :--- |
| **Docling** | IBM Research / LF AI & Data | **MIT** | Permissive | Deep PDF, XLSX, and scanned document table extraction. Converts multi-column vendor invoices into structured Markdown and JSON trees. |
| **Unstructured** | Unstructured.io | **Apache 2.0** | Permissive | Modular document partitioners for text, TIFF, and DOCX files. Generates clean document element chunks. |
| **Uppy** | Transloadit | **MIT** | Permissive | Client-side drag-and-drop file uploader component with modular UI dashboard and progress indicators. |
| **Companion** | Transloadit | **MIT** | Permissive | Self-hosted backend server handling third-party cloud authentication and direct file streaming from Google Drive, Dropbox, and Box. |
| **Google Drive API** | Google LLC | **Apache 2.0** | Permissive | Official `googleapis` Node.js client library managing OAuth2 consent, file metadata queries, and streaming file downloads. |

### Architectural Selection Rationale
1. **Docling for Document Parsing**:
   - Docling extracts tables and complex tabular hierarchies from PDF price sheets with higher layout fidelity than standard OCR.
   - Its MIT license allows unrestricted commercial usage and local containerized deployment alongside our Python microservice.
2. **Uppy and Companion for Ingress**:
   - Uppy provides a polished drag-and-drop interface.
   - Combined with self-hosted Companion, it allows users to link their Google Drive accounts and stream invoices directly into Wholeshare without routing files through third-party servers.

---

## 3. HuggingFace & Kaggle Dataset Pipeline

To calibrate local models such as `qwen3.5:9b` on B2B procurement documents, Wholeshare curates real and synthetic commerce datasets.

### Permissive Datasets on HuggingFace

| Dataset Identifier | Author / Org | License | Samples | Modality | Curation Function |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `katanaml-org/invoices-donut-data-v1` | Katana ML | **MIT** | 500 | Image + JSON | Annotated B2B invoices with line items, tax, and totals. |
| `CC1984/mall_receipt_extraction_dataset` | CC1984 | **MIT** | 2,923 | Image + Text | Retail and wholesale receipts with exact line-item breakdowns. |
| `shirastromer/supermarket-receipts` | Shira Stromer | **Apache 2.0** | ~1,000 | Parquet | Food and agricultural commodity purchase records. |

### Ingestion, Curation, and Compression Pipeline
1. **Download via HuggingFace CLI**:
   The `hf` CLI downloads curated datasets locally:
   ```bash
   hf datasets download katanaml-org/invoices-donut-data-v1 --local-dir data/datasets/invoices
   ```
2. **Normalization**:
   Raw items are parsed through [src/lib/ingestion-pipeline.js](file:///Users/siva/Documents/Paypal_project/src/lib/ingestion-pipeline.js). Prices are converted to exact integer cents, and vendor descriptions are mapped to canonical SKUs.
3. **Compression**:
   When training datasets exceed local memory constraints, Wholeshare compresses curated datasets using Gzip or LZ4. The compression helper produces high compression ratios (averaging 2.7x reduction) for fast network transfer and memory caching.

---

## 4. End-to-End System Architecture

The following diagram illustrates the ingestion, extraction, grounding, and translation lifecycle:

```
+-------------------------------------------------------------------------------------------------+
|                                Wholeshare Ingestion Pipeline                                    |
|                                                                                                 |
|   [ Browser Drag & Drop ]       [ Google Drive OAuth ]       [ External Agent API ]             |
|   (Uppy Dashboard UI)           (Companion Server)           (HMAC-SHA256 Signed Ingress)       |
|            |                             |                                  |                   |
|            +-----------------------------+----------------------------------+                   |
|                                          |                                                      |
|                                          v                                                      |
|                           [ Document Ingress Controller ]                                       |
|                                          |                                                      |
|                                          v                                                      |
|                       [ Multimodal Extractor & Normalizer ]                                     |
|                       - Table Layout Parsing (Docling)                                          |
|                       - Integer Cent Enforcement (Branded Types)                                |
|                       - Canonical SKU Mapping (Fuzzy Aliases)                                   |
|                                          |                                                      |
|                                          v                                                      |
|                          [ Instinct Memory Graph Sync ]                                         |
|                          - entities/buyer_<id>_procurement.md                                   |
|                          - Historical Moving Average Unit Price                                 |
|                          - Pledged Volume & Spend Caps                                          |
|                                          |                                                      |
|                                          v                                                      |
|                         [ Standardized Model Access Layer ]                                     |
|                         - ingest_business_document                                              |
|                         - query_procurement_baseline                                            |
|                         - import_google_drive_document                                          |
|                         - grep_memory / read_memory_entity                                      |
|                                          |                                                      |
|                                          v                                                      |
|                       [ Autonomous Syndicate Action & Settlement ]                              |
|                       - ACP Mandate Spawning (spawn_sme_mandate)                                |
|                       - Coalition Volume Solving (run_coalition_negotiation)                    |
|                       - PayPal Orders v2 Soft Holds (create_order: AUTHORIZE)                   |
+-------------------------------------------------------------------------------------------------+
```

---

## 5. Ingress API Routes & Security Boundaries

Wholeshare exposes dedicated endpoints for users, cloud storage integrations, and external autonomous agents:

### 1. Direct File Upload
- **Method**: `POST /api/v1/ingest/upload`
- **Body**: Multipart file upload or JSON payload containing `buyerId`, `fileName`, and `content`.
- **Response**: HTTP 201 Created with parsed line items and Instinct Memory sync status.

### 2. Google Drive Import
- **Method**: `POST /api/v1/ingest/google-drive`
- **Body**:
  ```json
  {
    "fileId": "1a2b3c4d5e",
    "fileName": "sysco_annual_contract.json",
    "buyerId": "sme_austin_artisan",
    "accessToken": "ya29.a0AfH6SM..."
  }
  ```
- **Response**: HTTP 200 OK with imported document metadata.

### 3. External Agent Ingress
- **Method**: `POST /api/v1/ingest/agent-dispatch`
- **Headers**:
  - `x-wholeshare-signature`: HMAC-SHA256 hex digest computed over `${timestamp}.${rawBody}` using the shared gateway secret.
  - `x-wholeshare-timestamp`: Epoch timestamp in seconds. Requests drifting beyond 300 seconds are rejected.
- **Response**: HTTP 202 Accepted.

### 4. Procurement Baseline Query
- **Method**: `GET /api/v1/ingest/documents?buyerId=sme_austin_artisan`
- **Response**: HTTP 200 OK returning all historical invoices and the active baseline profile.

---

## 6. Model Access Protocol via Vercel AI SDK

Wholeshare registers 19 tools in [src/lib/tool-registry.js](file:///Users/siva/Documents/Paypal_project/src/lib/tool-registry.js). Any model (local Qwen 3.5 9B, Claude 3.5 Sonnet, or GPT-4o) accesses the ingestion pipeline through three specialized function declarations:

### 1. `ingest_business_document`
Parses and indexes an invoice or contract payload into structured entities.
```json
{
  "name": "ingest_business_document",
  "description": "Business Data Pipeline tool. Parses and ingests vendor invoices, price sheets, and POs into structured procurement entities and Instinct Memory.",
  "parameters": {
    "type": "object",
    "properties": {
      "buyerId": { "type": "string" },
      "documentJson": { "type": "string" },
      "fileName": { "type": "string" }
    },
    "required": ["buyerId", "documentJson"]
  }
}
```

### 2. `query_procurement_baseline`
Retrieves a buyer's historical unit price, consumption rate, and specifications.
```json
{
  "name": "query_procurement_baseline",
  "description": "Business Data Pipeline tool. Retrieves the historical unit price, consumption rate, and specifications for a buyer and SKU from Instinct Memory.",
  "parameters": {
    "type": "object",
    "properties": {
      "buyerId": { "type": "string" },
      "sku": { "type": "string" }
    },
    "required": ["buyerId"]
  }
}
```

### 3. `import_google_drive_document`
Fetches and processes an invoice directly from Google Drive.
```json
{
  "name": "import_google_drive_document",
  "description": "Business Data Pipeline tool. Imports a procurement document or invoice from Google Drive using its file ID.",
  "parameters": {
    "type": "object",
    "properties": {
      "buyerId": { "type": "string" },
      "fileId": { "type": "string" },
      "fileName": { "type": "string" }
    },
    "required": ["buyerId", "fileId"]
  }
}
```

---

## 7. Instinct Memory Representation

Ingested documents generate structured markdown entities under `data/memory/entities/buyer_<id>_procurement.md`:

```markdown
---
id: buyer_sme_austin_artisan_procurement
type: organization
aliases: ["sme_austin_artisan", "procurement-profile", "organic-flour-50lb"]
updatedAt: "2026-10-25T18:50:30.006Z"
---
# Procurement Profile: sme_austin_artisan (buyer_sme_austin_artisan_procurement)

- Primary commodity SKU is organic-flour-50lb.
- Latest invoice number is INV_SYSCO_98421 from vendor Sysco Artisan Baking Supply.
- Invoice payment terms are NET_30.
- Purchased quantity is 150 units at 2850 integer cents per unit.
- Total invoice expenditure is 573650 integer cents.
- Approved spec protein threshold is 12.7 percent.
- Organic certification requirement is true.
- Updated at 2026-10-25T18:50:30.006Z.
```

When an agent is asked to evaluate syndicate deals, the agent reads this entity using `read_memory_entity` or `query_procurement_baseline` to determine the exact price ceiling and required specifications.

---

## 8. Verification and Quality Gates

The pipeline is verified locally using automated test suites and the dedicated verification skill:

1. **Unit Test Suite**:
   Execute automated tests across parsing, normalization, HMAC authentication, and tool execution:
   ```bash
   node --test test/ingestion-pipeline.test.js
   ```
2. **Feature Map Linter**:
   Verify that all 20 feature maps across `verify-syndicate`, `verify-paypal`, and `verify-ingestion` comply with the 4-header standard:
   ```bash
   npm run lint:features
   ```
3. **CLI Lever**:
   Exercise pipeline functions directly using [scripts/control-ingestion.js](file:///Users/siva/Documents/Paypal_project/scripts/control-ingestion.js):
   - `node scripts/control-ingestion.js doctor`
   - `node scripts/control-ingestion.js ingest:file`
   - `node scripts/control-ingestion.js ingest:gdrive`
   - `node scripts/control-ingestion.js ingest:agent`
   - `node scripts/control-ingestion.js baseline:query`
   - `node scripts/control-ingestion.js dataset:curate`
