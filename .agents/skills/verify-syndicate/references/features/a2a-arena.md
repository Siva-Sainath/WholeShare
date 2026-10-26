# Feature: Real-Time A2A Negotiation Arena

Interactive radial node graph canvas visualizing multi-agent communication, deal proposals, and escrow locking.

## Sub-features
- `orchestrator-core-node`: Center node representing the Master Syndicate Orchestrator.
- `agent-satellite-nodes`: Radial nodes for participating SME agents, the Kernel Sourcing agent, and the Wholesale Supplier agent.
- `animated-particle-beams`: Glowing pulses traveling along graph edges during message passing.
- `speech-bubbles`: Plain English speech callouts showing negotiation intent.
- `json-payload-drawer`: Slide-out panel showing the APIMatic-typed JSON payload of any selected message.

## How to get to it (user POV)
Located in the upper-right quadrant (65% width) of the dashboard (`[data-testid="a2a-arena"]`).

## Driving it with control-syndicate
Preconditions:
- Node runtime active and demo fixtures initialized.

Step-by-step driving commands:
```bash
# Stream negotiation events and verify settling
node .cursor/skills/verify-syndicate/control-syndicate.mjs match-clan --sku "organic-flour-50lb" --simulate-agents 3
node .cursor/skills/verify-syndicate/control-syndicate.mjs wait-settle
```

Proof standards:
- Clan status transitions to `THRESHOLD_MET`.
- SSE stream event `CLAN_CAPACITY_REACHED_100_PERCENT` is emitted.
- All satellite nodes connect to the orchestrator core node with green edge indicators.
- Settle verification returns `databaseState: "CONVERGED"` with zero pending mutations.

## Gotchas
- The canvas uses React Flow / SVG renderers.
- High-frequency events are throttled to 250ms per animation step to ensure judge readability.
