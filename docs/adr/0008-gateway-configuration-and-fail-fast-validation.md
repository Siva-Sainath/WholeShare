# 0008: Gateway Configuration and Fail-Fast Validation

## Context
Financial gateways rely on numerous credentials, timeout windows, and operational limits. Misconfigured parameters or missing secrets that fail during runtime can result in dropped transactions, silent authorization expirations, or security vulnerabilities.

## Decision
We implement a centralized, strictly-validated configuration module at `src/config/gateway.config.ts` using Zod:
1. **Startup Fail-Fast**: The schema parses environment variables once on startup. If any required value is missing or violates schema constraints, the application immediately halts and names the invalid setting without printing secret values.
2. **Explicit Values (No Default Fallbacks)**: Three critical financial parameters have no default fallbacks and must be explicitly configured:
   - `PAYPAL_KEY_RETENTION_HOURS`
   - `MAX_PENDING_RECHECK_COUNT`
   - `AUTHORIZATION_VALIDITY_DAYS` (29 days until confirmed)
3. **Cross-Field Validations**:
   - All durations must be positive numbers.
   - Poll interval must be strictly shorter than the inspection window.
   - Retention window must be strictly shorter than the authorization validity.
   - Sandbox and live PayPal API hosts and credentials cannot be mixed.
4. **Single Point of Ingress**: Code outside `src/config/gateway.config.ts` is strictly prohibited from accessing `process.env` directly.

## Consequences
- Prevents silent runtime configuration failures during transactions.
- Obfuscates credentials in startup crash logs.
- Enforces explicit operator awareness of financial timeout parameters.
