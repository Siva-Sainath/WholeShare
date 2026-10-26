# Feature: Multimodal Document Parsing and SKU Normalization

Wholeshare extracts structured B2B commerce entities from unstructured invoices, receipts, spreadsheets, and PDF documents. The parsing pipeline normalizes non-standard vendor item descriptions into canonical Wholeshare commodity SKUs and standard integer cent currencies.

## Sub-features
- `table-line-item-extraction`: Parsing of vendor tables into line items, quantities, and rates.
- `canonical-sku-mapping`: Fuzzy alias mapping translating arbitrary vendor descriptions into canonical catalog SKUs.
- `spreadsheet-workbook-parsing`: Dynamic header row detection across multi-sheet Excel workbooks and RFC CSV files.
- `pdf-document-extraction`: PyMuPDF vector text extraction with optical OCR fallback for scanned archive bills.
- `optical-picture-ocr`: Optical character recognition extracting vendor, items, and amounts from PNG, JPEG, and scanned pictures.
- `financial-safety-arithmetic`: Exact integer cent calculation and spending cap verification.

## How to get to it (user POV)
- Automatic extraction executes upon document submission via drag-and-drop or API.
- Parsed entities appear in the procurement baseline and ledger views.

## Driving it with control-ingestion
Preconditions:
- Pipeline parser loaded with canonical catalog definitions.
- Tesseract OCR binary and PyMuPDF python environment present.

Step-by-step driving commands:
```bash
node scripts/control-ingestion.js benchmark:accuracy
node scripts/control-ingestion.js ingest:excel data/benchmark_corpus/04_distributor_multi_sheet.xlsx
node scripts/control-ingestion.js ingest:csv data/benchmark_corpus/06_b2b_procurement_po.csv
node scripts/control-ingestion.js ingest:pdf data/benchmark_corpus/07_vector_digital_invoice.pdf
node scripts/control-ingestion.js ingest:image data/benchmark_corpus/01_sysco_commercial_invoice.png
```

Proof standards:
- Output contains `canonicalSku` resolved to catalog identifiers.
- Line items verify `specProperties` including `proteinPct` and `organicCertified`.
- Financial arithmetic verifies total equals quantity multiplied by unit price in integer cents.
- Optical picture parsing outputs `extractionMethod: "OPTICAL_IMAGE_OCR"` and extracts vendor names.
- Benchmark command outputs 100% format support, 100% safety pass rate, and records metrics to `docs/assets/ingestion_benchmark_report.json`.

## Gotchas
- Unrecognized product lines default to standard commodity categories for human review.
- Missing vendor dates default to current UTC timestamps.
- Explicit totals smaller than line item subtotals are rejected in favor of calculated totals.
