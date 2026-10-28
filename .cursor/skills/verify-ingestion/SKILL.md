---
name: verify-ingestion
description: Drive and verify the Wholeshare Business Data Ingestion Pipeline. Ingest multi-format B2B invoices and purchase orders, import from Google Drive, verify cryptographic HMAC agent ingress, sync procurement facts to Instinct Memory, benchmark safety and accuracy across online datasets, and curate compressed HuggingFace datasets.
---

# Verify Business Data Ingestion Pipeline

Drive and prove the multi-channel business document ingestion pipeline for Wholeshare. Validates document parsing across XLSX, CSV, PDF, PNG, and JSON formats. Enforces exact integer cent normalization, Instinct Memory indexing, Google Drive import, and external agent cryptographic HMAC ingress.

## Launch

Start the Wholeshare development server and local backend services:

```bash
npm run dev
```

Ready when stdout prints:
```
=== Wholeshare Web Command Center running at http://localhost:3000 ===
```

## Doctor

Perform a pre-flight inspection of the ingestion filesystem, HuggingFace CLI environment, and memory store:

```bash
node scripts/control-ingestion.js doctor
```

Expected healthy output:
```json
{
  "runtime": { "node": "v26.8.1", "platform": "darwin" },
  "ingestion": {
    "memoryEntitiesIndexed": 15,
    "storageDirectoryAvailable": true,
    "canonicalSkuCount": 3,
    "compressionEngineReady": true
  },
  "integrations": {
    "googleDriveMockConnector": "READY",
    "agentIngressHmacProtection": "ENFORCED",
    "doclingCompatibility": "VERIFIED",
    "huggingfaceCliAvailable": true
  },
  "status": "HEALTHY"
}
```

## Drive

Execute end-to-end ingestion actions via the CLI lever:

### 1. Run Complete Accuracy, Support, and Safety Gauntlet
```bash
node scripts/control-ingestion.js benchmark:accuracy
```
Executes automated ingestion across the 13 online benchmark documents. Verifies 100% format support, 100% financial safety (rejection of forged signatures, stale timestamps, and spend caps), and evaluates extraction precision against ground truth.

### 2. Ingest Multi-Sheet Excel Workbook
```bash
node scripts/control-ingestion.js ingest:excel data/benchmark_corpus/04_distributor_multi_sheet.xlsx
```
Proves dynamic header row detection, multi-column extraction, and integer cent normalization from distributor spreadsheets.

### 3. Ingest Delimited Procurement CSV
```bash
node scripts/control-ingestion.js ingest:csv data/benchmark_corpus/06_b2b_procurement_po.csv
```
Proves parsing of RFC quoted CSV procurement orders with line item totals.

### 4. Ingest Vector or Scanned PDF
```bash
node scripts/control-ingestion.js ingest:pdf data/benchmark_corpus/07_vector_digital_invoice.pdf
```
Proves PyMuPDF vector text extraction and optical OCR fallback for scanned bills.

### 5. Ingest Scanned Receipt or Invoice Picture
```bash
node scripts/control-ingestion.js ingest:image data/benchmark_corpus/01_sysco_commercial_invoice.png
```
Proves optical character recognition on commercial invoice images.

### 6. Import Google Drive File
```bash
node scripts/control-ingestion.js ingest:gdrive
```
Proves external storage connector ingestion and metadata tracking.

### 7. Dispatch Signed External Agent Ingress
```bash
node scripts/control-ingestion.js ingest:agent
```
Proves HMAC-SHA256 signature verification and replay window enforcement.

### 8. Query Buyer Procurement Baseline
```bash
node scripts/control-ingestion.js baseline:query
```
Proves Instinct Memory retrieval of historical unit prices and consumption rates.

### 9. Curate and Compress Training Dataset
```bash
node scripts/control-ingestion.js dataset:curate
```
Proves dataset normalization and gzip payload compression.

## Evidence

Capture and store proof artifacts:
- Automated benchmark report in `docs/assets/ingestion_benchmark_report.json`.
- Ingested document records in `INGESTED_DOCUMENTS` map.
- Generated Instinct Memory markdown files in `data/memory/entities/buyer_<id>_procurement.md`.
- Automated test report from `node --test test/ingestion-pipeline.test.js`.

## Cleanup

Reset test memory entities and temporary upload records:

```bash
rm -f data/memory/entities/buyer_test_* data/memory/entities/buyer_sme_*_procurement.md
```

## Helpers

The ingestion pipeline CLI lever is located at [scripts/control-ingestion.js](file:///Users/siva/Documents/Paypal_project/scripts/control-ingestion.js).

Supported commands:
- `doctor`: Health and environment audit.
- `benchmark:accuracy`: Full safety, support, and accuracy benchmark.
- `ingest:file`: Local document ingestion.
- `ingest:image`: Optical OCR image ingestion.
- `ingest:excel`: Multi-sheet spreadsheet ingestion.
- `ingest:csv`: Delimited procurement CSV ingestion.
- `ingest:pdf`: Vector and scanned PDF ingestion.
- `ingest:gdrive`: Google Drive file import.
- `ingest:agent`: HMAC authenticated agent ingress.
- `baseline:query`: Instinct Memory baseline query.
- `dataset:curate`: Dataset curation and compression benchmark.
