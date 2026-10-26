# Feature: Google Drive Cloud Document Import

Wholeshare integrates directly with Google Drive through OAuth2 tokens and file identifiers. The platform imports buyer purchase orders, rate sheets, and recurring supply contracts directly into the procurement pipeline without manual local downloading.

## Sub-features
- `google-drive-connector`: File retrieval using Google Drive REST API v3 and OAuth2 tokens.
- `metadata-tagging`: Document lineage tracking preserving Google Drive file IDs and source timestamps.
- `remote-file-streaming`: Direct memory buffer ingestion preventing local disk bloat.

## How to get to it (user POV)
- In the Wholeshare web workbench, click Import from Google Drive.
- Authenticate and select a supplier invoice or contract from the file picker modal.
- Or dispatch a POST request to `/api/v1/ingest/google-drive`.

## Driving it with control-ingestion
Preconditions:
- Google Drive connector configured or mock token active.

Step-by-step driving commands:
```bash
node scripts/control-ingestion.js ingest:gdrive
```

Proof standards:
- Command returns status `PROCESSED` with `metadata.source` set to `GOOGLE_DRIVE`.
- Ingested document records valid file ID and token status.
- Extracted commodity lines synchronize into Instinct Memory.

## Gotchas
- Stale OAuth tokens must trigger token refresh flows rather than hard failing.
- Shared enterprise drive permissions must be granted to the Wholeshare service account.
