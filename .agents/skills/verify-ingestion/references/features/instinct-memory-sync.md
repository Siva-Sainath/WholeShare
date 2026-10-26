# Feature: Instinct Memory Synchronization

Wholeshare indexes ingested business documents into the Git-backed Instinct Memory filesystem. Extracted procurement facts, vendor relationships, and historical pricing baselines are linked into structured markdown entities queryable by autonomous agents.

## Sub-features
- `procurement-profile-indexing`: Creation of markdown entity files in `data/memory/entities/`.
- `procurement-baseline-query`: Fast programmatic retrieval of historical price averages and pledged quantities.
- `knowledge-graph-linking`: Bidirectional [[links]] connecting buyers, coalitions, and SKUs.

## How to get to it (user POV)
- Query Instinct Memory directly using the `grep_memory` or `query_procurement_baseline` tools.
- Or inspect the local filesystem under `data/memory/entities/buyer_<id>_procurement.md`.

## Driving it with control-ingestion
Preconditions:
- Target buyer document ingested into the pipeline.

Step-by-step driving commands:
```bash
node scripts/control-ingestion.js baseline:query
```

Proof standards:
- Command returns buyer procurement profile with `hasHistoricalData: true`.
- Output displays `baselineUnitPriceCents`, `monthlyPledgedUnits`, and `spec` attributes.
- Underlying markdown entity exists on disk and passes frontmatter parsing.

## Gotchas
- Git commits to memory store should be batched to avoid commit history bloat.
- Entity aliases must remain distinct to prevent ambiguous grep collisions.
