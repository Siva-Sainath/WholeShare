---
name: verify-ingestion
description: Drive and verify the Wholeshare Business Data Ingestion Pipeline. Ingest multi-format B2B invoices and purchase orders, import from Google Drive, verify cryptographic HMAC agent ingress, sync procurement facts to Instinct Memory, and curate compressed HuggingFace datasets.
---

# Verify Business Data Ingestion Pipeline

Drive and prove the multi-channel business document ingestion pipeline for Wholeshare. Validates document parsing, exact integer cent financial normalization, Instinct Memory indexing, Google Drive import, and external agent cryptographic ingress.

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

### 1. Ingest Local File (Drag-and-Drop Ingress)
```bash
node scripts/control-ingestion.js ingest:file
```
Proves extraction of vendor name, line items, and integer cents normalization.

### 2. Import Google Drive File
```bash
node scripts/control-ingestion.js ingest:gdrive
```
Proves external storage connector ingestion and metadata tracking.

### 3. Dispatch Signed External Agent Ingress
```bash
node scripts/control-ingestion.js ingest:agent
```
Proves HMAC-SHA256 signature verification and replay window enforcement.

### 4. Query Buyer Procurement Baseline
```bash
node scripts/control-ingestion.js baseline:query
```
Proves Instinct Memory retrieval of historical unit prices and consumption rates.

### 5. Curate and Compress Training Dataset
```bash
node scripts/control-ingestion.js dataset:curate
```
Proves dataset normalization and gzip payload compression.

## Evidence

Capture and store proof artifacts:
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
- `ingest:file`: Local document ingestion.
- `ingest:gdrive`: Google Drive file import.
- `ingest:agent`: HMAC authenticated agent ingress.
- `baseline:query`: Instinct Memory baseline query.
- `dataset:curate`: Dataset curation and compression benchmark.
