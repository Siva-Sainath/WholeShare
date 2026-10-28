# Feature: Clash of Clans Syndicate Lobby

Visual inventory of active purchasing syndicates (Clans) styled with game-like strategy cards, tier progress bars, and natural language ingress.

## Sub-features
- `clan-card`: Card component showing SKU image, unit counter (`350 / 500 units`), and savings rate.
- `tier-progress-ring`: Segmented progress bar indicating current unlock level (Tier 1 -> Tier 2 -> Tier 3).
- `nl-ingress-box`: Natural language input textarea where users type requests.
- `bot-ingress-drawer`: Modal displaying signed webhook URLs and curl commands for Grok/Telegram bots.
- `kernel-proof-modal`: Slide-over drawer displaying Kernel cloud browser screenshots of wholesale price tables.

## How to get to it (user POV)
Located in the upper-left quadrant (35% width) of the dashboard (`[data-testid="clan-lobby"]`).

## Driving it with control-syndicate
```bash
# Drive SME onboarding from natural language
node .cursor/skills/verify-syndicate/control-syndicate.mjs spawn-sme \
  --name "GreenLeaf Organics" \
  --sku "organic-flour-50lb" \
  --qty 30 \
  --max-usd 900
```

## Gotchas
- Pledges exceeding the SME's `max_auto_authorize_usd` policy cap will require explicit QR code step-up.
- If Kernel cloud browser fails, the scraper falls back automatically to cached JSON fixtures.
