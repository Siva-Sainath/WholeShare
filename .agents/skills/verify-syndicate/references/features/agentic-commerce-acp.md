# Feature: Agentic Commerce Protocol (ACP) & Conversational Ingress

Natural language discovery and cryptographically signed purchasing mandates enabling autonomous buyer agents to pool orders into syndicates over PayPal rails.

## Sub-features
- `acp-manifest`: Machine-readable discovery manifest located at `/.well-known/agentic-commerce.json`.
- `nlp-ingress-parser`: Conversational natural language interface extracting commodity intent, volume, budget caps, and locations.
- `delegated-buyer-mandate`: HMAC-SHA256 signed authority tokens restricting agent spend to hard policy caps.
- `hero-coffee-syndicate`: Preset demonstration of 3 Austin coffee shops pooling together for Ethiopian Yirgacheffe green coffee beans.

## How to get to it (user POV)
- Type natural language procurement requests directly into the conversational input box at the top of the Clan Lobby.
- Or click the Austin Coffee Syndicate preset button on the Judge Simulator bar.

## Driving it with control-syndicate
Preconditions:
- Node.js runtime environment active.
- Sourced wholesale catalog and pricing fixtures loaded.

Step-by-step driving commands:
```bash
# 1. Inspect Agentic Commerce Protocol manifest and endpoints
node .cursor/skills/verify-syndicate/control-syndicate.mjs acp:manifest

# 2. Test conversational natural language ingress with Austin coffee shop prompt
node .cursor/skills/verify-syndicate/control-syndicate.mjs ingress:nlp

# 3. Execute 1-click end-to-end judge simulator flow
node .cursor/skills/verify-syndicate/control-syndicate.mjs judge:demo
```

Proof standards:
- ACP manifest returns HTTP 200 with JSON specification containing endpoints, protocols, and PayPal payment rails.
- NLP ingress returns confidence score >= 95% and valid `MANDATE-ACP-*` token.
- Judge demo completes all 5 phases with 100% invariant verification and $0.00 upfront cash deduction.

## Gotchas
- Natural language prompts without explicit budget caps trigger interactive clarifying questions before generating mandates.
- Mandates expire after the declared deadline (default 7 days) and cannot authorize funds once expired.
