# 0010: Read-Only Readiness Verification via doctor-escrow

## Context
Before executing multi-party escrow workflows, the developer and automated test runners need an authoritative command to verify that all database tables, PayPal sandbox credentials, boundary restrictions, and network prerequisites are satisfied without generating mock payments or modifying state.

## Decision
We implement a strictly read-only diagnostics command in `control-syndicate.mjs`:
`node .cursor/skills/verify-syndicate/control-syndicate.mjs doctor-escrow`
The command checks the following without creating orders, holds, captures, or refunds:
1. **Database Schema**: PostgreSQL connection is healthy and the `IdempotencyRecord` table exists with a unique constraint on its operation key.
2. **PayPal Sandbox Authentication**: Successfully retrieves an OAuth2 token from PayPal Sandbox, and asserts that a subsequent call reuses the cached token without an additional network hop.
3. **Architectural Boundary Scan**: Scans the codebase to ensure no module outside `src/gateway/` imports PayPal SDK packages or references PayPal API hostnames (`api-m.sandbox.paypal.com`, `api.sandbox.paypal.com`, `api-m.paypal.com`). This static scan also runs in CI builds.
4. **Configuration Validation**: `src/config/gateway.config.ts` passes Zod parsing against the active environment.
5. **Report Handling**: Ingests a sample buyer-agent report with an unknown ID and confirms it is rejected and logged without altering database state.
6. **Webhook Network Reachability**: Asserts that the application webhook listener is accessible over public HTTPS on port 443 per PayPal webhook delivery specifications.

## Consequences
- Provides a 1-click diagnostic baseline before starting development or judging demos.
- Catches missing tables, bad credentials, and architectural boundary violations immediately.
