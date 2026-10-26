# Feature: Multimodal Document Parsing and SKU Normalization

Wholeshare extracts structured B2B commerce entities from unstructured invoices, receipts, and spec sheets. The parsing pipeline normalizes non-standard vendor item descriptions into canonical Wholeshare commodity SKUs and standard integer cent currencies.

## Sub-features
- `table-line-item-extraction`: Parsing of vendor tables into line items, quantities, and rates.
- `canonical-sku-mapping`: Fuzzy alias mapping translating arbitrary vendor descriptions into canonical catalog SKUs.
- `commodity-spec-extraction`: Capture of technical attributes such as protein percentage and organic certification.

## How to get to it (user POV)
- Automatic extraction executes upon document submission via drag-and-drop or API.
- Parsed entities appear in the procurement baseline and ledger views.

## Driving it with control-ingestion
Preconditions:
- Pipeline parser loaded with canonical catalog definitions.

Step-by-step driving commands:
```bash
node scripts/control-ingestion.js ingest:file
```

Proof standards:
- Output contains `canonicalSku` resolved to catalog identifiers.
- Line items verify `specProperties` including `proteinPct` and `organicCertified`.
- Financial arithmetic verifies total equals quantity multiplied by unit price in integer cents.

## Gotchas
- Unrecognized product lines default to standard commodity categories for human review.
- Missing vendor dates default to current UTC timestamps.
