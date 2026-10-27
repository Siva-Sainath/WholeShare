# 01: Gateway Configuration, Verification Skill & Anti-Mock Diagnostic Harness

**What to build:** The foundational configuration and diagnostics harness that enforces the zero-mock policy, validates all runtime settings and secrets with Zod at startup, and provides a read-only health check without moving money.

**Blocked by:** H1: Provision Sandbox Accounts & .env

**Status:** completed

- [x] Implement `src/config/gateway.config.ts` using Zod, validating timeouts, secrets, and URLs on boot with secret masking in error traces.
- [x] Enforce the no-mock policy via `scripts/check-no-mocks.mjs` wired into `package.json` (`npm run check:mocks`).
- [x] Ensure the verification skill at `.agents/skills/verify-syndicate/SKILL.md` is loaded by Antigravity.
- [x] Implement `control-syndicate.mjs doctor-escrow` validating PostgreSQL connectivity, token generation and caching, boundary import rules, and configuration schema.
- [x] Report public HTTPS web address check as "not configured" until H2 is completed.
- [x] Report idempotency check as "pending" (never passed) until Ticket 06 is completed.
- [x] Output `evidence/doctor-escrow.json` diagnostic report.

## Comments

### Implementation Summary
- `src/config/gateway.config.ts`: Implemented ADR 0008 fail-fast validation with Zod and secret masking.
- `scripts/control-syndicate.mjs doctor-escrow`: Implemented ADR 0010 read-only diagnostics baseline.
- `evidence/doctor-escrow.json`: Generated live diagnostic report validating OAuth2 token acquisition in 846ms and client token caching.
- Zero-Mock compliance verified via `scripts/check-no-mocks.mjs`.
