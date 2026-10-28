# Feature: Autonomous Agent Copilot and Tool Calling Harness

In-browser command console enabling Qwen 3.5 9B to control all platform features via native tool calling.

## Sub-features
- `tool-registry`: Eight JSON schema declarations mapping to platform capabilities.
- `interactive-copilot-drawer`: In-page command bar with quick prompt chips.
- `real-time-thought-stream`: Live timeline rendering model thoughts, tool calls, and results.
- `step-up-qr-modal`: PayPal Invoicing QR code popup for allocations exceeding threshold.
- `deterministic-fallback`: Rule engine executing deal cycles when model calls exceed timeout.

## How to get to it (user POV)
Located directly beneath the middle grid on the main command center dashboard at `http://localhost:3000`.

## Driving it with control-syndicate
Preconditions:
- Node runtime active and Ollama daemon running with `qwen3.5:9b`.

Step-by-step driving commands:
```bash
# Verify registered tools
node scripts/control-wholeshare.js tools:list

# Execute full autonomous agent deal cycle
node scripts/control-wholeshare.js agent-cycle

# Drive legacy verification harness
node .cursor/skills/verify-syndicate/control-syndicate.mjs lock-escrow --dry-run
```

Proof standards:
- Execution returns HTTP 200 with session identifier and complete step breakdown.
- Tool invocations broadcast `AGENT_TOOL_CALL` and `AGENT_TOOL_RESULT` events over SSE.
- Escrow transitions to `LOCKED` status with PayPal Orders v2 soft authorization holds.

## Gotchas
- Initial model execution on Apple Silicon MLX requires up to 7 seconds to load weights.
- The harness enforces a 25-second timeout before falling back to deterministic calculations.
