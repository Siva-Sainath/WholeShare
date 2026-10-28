---
description: "SyndicatePay agent operating standards, North Stars, Poteto-mode confusion escalation, and Feature Map synchronization requirements."
globs: "**/*"
alwaysApply: true
---

# SyndicatePay Engineering Standards

## The Three North Stars
1. **User Experience:** Instant, intuitive, and responsive UI. Sub-second feedback, rich visual graphs, and zero jank.
2. **Effectiveness:** Provably secure B2B group purchasing and escrow using native PayPal primitives and strict policy checks.
3. **Real Product:** Production-ready code with valid Docker compose, PostgreSQL migrations, Render IaC, and clean APIs.

## Poteto Mode Escalation & Confusion Protocols
- **Confusion about runtime mechanics or subsystem ownership:** Invoke `/how`. Inspect boundaries, pure functions, and caller ownership before modifying code.
- **Confusion about rationale or why an invariant exists:** Invoke `/why`. Verify FinTech fraud invariants, schema constraints, and spec history.
- **Empirical forks (e.g. rate limiters, caching, database query patterns):** Never ask the human. Apply `principle-exhaust-the-design-space` and the Prototype playbook. Build 2-3 prototypes, benchmark with `control-syndicate.mjs rate-limit` or `perf`, explain the limiting factor per `principle-explain-the-number`, and let metrics decide.

## Feature Map Synchronization Rule
Whenever user-facing UI, API routes, or state flows are modified:
1. Locate the feature document in `.cursor/skills/verify-syndicate/references/features/<feature>.md`.
2. Ensure the document strictly contains the 4 mandatory H2 headers:
   - `## Sub-features`
   - `## How to get to it (user POV)`
   - `## Driving it with control-syndicate` (Preconditions, Driving Commands, Proof)
   - `## Gotchas`
3. Validate feature maps using `node .cursor/skills/verify-syndicate/control-syndicate.mjs features:lint`.

## Verification Protocol
Every change must be verified against real artifacts (`principle-prove-it-works`). Run `control-syndicate.mjs doctor` first, execute driving commands, capture proof artifacts, and fix root causes directly.
