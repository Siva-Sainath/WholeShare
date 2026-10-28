# Feature: Durable Agent Harness and Checkpointing

PostgreSQL-backed event journaling and trajectory checkpointing for autonomous multi-turn negotiation.

## Sub-features
- `session-checkpointing`: Persists every agent turn and tool call into PostgreSQL.
- `crash-resumption`: Restores interrupted sessions from the last completed turn.
- `reflexive-self-correction`: Feeds mathematical invariant errors back to Qwen 3.5 9B for automated recovery.
- `external-agent-gateway`: Ingests HMAC-signed mandates and dispatches signed webhook callbacks.
- `paypal-toolkit-bridge`: Binds native PayPal agent tools to Orders v2 soft authorization holds.

## How to get to it (user POV)
Accessible via REST API endpoints `POST /api/v1/mandates`, `POST /api/v1/agent/chat`, and CLI command `node scripts/control-wholeshare.js agent-cycle`.

## Driving it with control-syndicate
Preconditions:
- PostgreSQL database accessible and Ollama daemon running with `qwen3.5:9b`.

Step-by-step driving commands:
```bash
# Execute durable agent cycle with database journaling
node scripts/control-wholeshare.js agent-cycle --durable

# Verify crash recovery and resumption
node scripts/control-wholeshare.js verify-durable-resume

# Run the 15-vector adversarial invariant gauntlet
node --test test/adversarial-gauntlet.test.js

# Drive legacy verification harness
node .cursor/skills/verify-syndicate/control-syndicate.mjs lock-escrow --dry-run
```

Proof standards:
- Verification asserts database rows inserted in `agent_sessions` and `agent_steps`.
- Invariant gauntlet achieves 100% interception rate with zero unhandled exceptions.
- State machine reaches `LOCKED` with PayPal Orders v2 soft authorization holds.

## Gotchas
- PostgreSQL connection pool must be initialized before dispatching concurrent agent sessions.
- In-memory fallback is strictly restricted to scenarios where the database is offline.
