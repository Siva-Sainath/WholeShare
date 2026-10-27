# 02: Money Math & State Rules Module (Pure Logic)

**What to build:** Pure deterministic functions implementing business rules, mathematical calculations, and state transitions with zero external network or PayPal calls.

**Blocked by:** None (can start immediately in parallel with 01)

**Status:** completed

- [x] Implement pure claim capping function: `min(damaged_units * unit_price, order_value)`.
- [x] Implement pro-rata share calculation and supplier payout amount deduction logic.
- [x] Implement Clan state machine transitions (`FORMING` -> `THRESHOLD_MET` -> `LOCKED` -> `FULFILLING` -> `SETTLED`) and member statuses (`PLEDGED`, `AUTHORIZED`, `CAPTURED`, `REFUNDED`).
- [x] Implement deterministic idempotency key generator: `hash(operation_type:clan_id:member_id:stage:reference)`.
- [x] Add unit tests verifying all calculations against the pure fixture: 5 members at 100 bags ($720 hold each), then 5 more join and each pays $580.
- [x] Verify 100% of tests pass without importing PayPal SDKs or network libraries.

## Comments

### Implementation Summary
- `src/domain/money-math.ts`: Pure functions for claim caps, pro-rata shares, tier unlocking, hold release, idempotency hashing, and Clan/Member transition state machines.
- `test/money-math.test.ts`: 24 unit test assertions covering the 5+5 member fixture ($720 to $580), damage caps, supplier deduction, and state validation. All passing in 7.9ms without network or PayPal imports.
