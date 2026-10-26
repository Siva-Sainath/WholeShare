# Feature: Document Upload and Drag-and-Drop Ingress

Wholeshare accepts multi-format procurement files through browser drag-and-drop and multipart HTTP POST endpoints. The system parses PDF invoices, delivery receipts, and CSV catalogs into structured line items with integer cents.

## Sub-features
- `drag-drop-ingress`: File drop zone supporting PDF, PNG, and JSON uploads.
- `integer-cent-normalization`: Conversion of floating currency amounts to exact integer cents.
- `idempotency-hashing`: SHA-256 content deduplication preventing double submission of invoices.

## How to get to it (user POV)
- Navigate to `http://localhost:3000`.
- Drop a PDF or JSON invoice file onto the Ingestion Dropzone.
- Or send a POST request to `/api/v1/ingest/upload`.

## Driving it with control-ingestion
Preconditions:
- Node.js runtime active and local storage directory writeable.

Step-by-step driving commands:
```bash
node scripts/control-ingestion.js ingest:file
```

Proof standards:
- Command returns HTTP status 201 with status `PROCESSED`.
- Response contains parsed line items with integer `unitPriceCents`.
- Total spend matches the sum of line item totals plus tax and freight.

## Gotchas
- Documents larger than 10MB require chunked streaming.
- Floating-point dollar values in raw JSON are rounded to integer cents automatically.
