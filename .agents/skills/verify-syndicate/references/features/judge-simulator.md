# Feature: Judge God-Mode Simulator Bar

Top sticky control header enabling 1-click execution of the complete 4-stage lifecycle and displaying live security telemetry.

## Sub-features
- `btn-step1-spawn`: Triggers SME spawning, bounded policy check, and Kernel tier scraping.
- `btn-step2-match`: Assembles the Clan, drives A2A negotiation to 100% capacity, and unlocks Tier 2 discount (28%).
- `btn-step3-escrow`: Executes PayPal Order authorizations (`intent: "AUTHORIZE"`) and batch capture.
- `btn-step4-dispute`: Simulates damaged goods delivery, submits photo proof, and executes pro-rata refund (-$300).
- `security-telemetry-badges`: Live badges for PayPal OAuth2, HMAC guard, policy caps, and Kernel status.

## How to get to it (user POV)
Visible at the very top of the application dashboard at all times (`[data-testid="judge-god-bar"]`).

## Driving it with control-syndicate
```bash
# Execute full flow sequentially
node .cursor/skills/verify-syndicate/control-syndicate.mjs spawn-sme --name "Judge Test SME" --qty 20
node .cursor/skills/verify-syndicate/control-syndicate.mjs match-clan --sku "organic-flour-50lb"
node .cursor/skills/verify-syndicate/control-syndicate.mjs lock-escrow --clan-id "clan_flour_01" --dry-run false
node .cursor/skills/verify-syndicate/control-syndicate.mjs trigger-dispute --clan-id "clan_flour_01" --damage-pct 25
```

## Gotchas
- Buttons are disabled during active SSE animations. Wait for `wait-settle` before triggering the next step.
- Step 4 (Dispute) requires Step 3 (Escrow Capture) to be completed first.
