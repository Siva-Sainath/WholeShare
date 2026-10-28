# Feature: Orders v2 Soft Holds & Escrow Authorization

Native PayPal Orders v2 soft holds using intent AUTHORIZE. This reserves buyer credit lines without upfront cash deductions until the wholesale syndicate reaches volume quorum.

## Sub-features
- `orders-v2-authorization`: Orders v2 intent AUTHORIZE prevents early working capital lockup.
- `acp-reference-binding`: Ties buyer ACP Shared Payment Token to purchase units reference ID.
- `atomic-batch-capture`: Captures authorized funds in a single batch transaction after fulfillment.

## How to get to it (user POV)
- Navigate to the Clan Lobby and click Form Syndicate.
- When member allocations are confirmed, click Authorize PayPal Escrow on the summary modal.

## Driving it with control-syndicate
Preconditions:
- Node.js runtime active.
- Live PayPal Sandbox credentials configured in .env.

Step-by-step driving commands:
```bash
# 1. Create a real Orders v2 authorization on PayPal Sandbox
node scripts/control-paypal.js order:authorize --amount 15000 --ref sme_austin_01

# 2. Query the live order details by order ID
node scripts/control-paypal.js order:get --order-id <ORDER_ID>

# 3. Verify batch escrow locking via master syndicate control
node .cursor/skills/verify-syndicate/control-syndicate.mjs lock-escrow --clan clan_flour_01
```

Proof standards:
- PayPal returns HTTP 201 Created with order status CREATED and intent AUTHORIZE.
- Approval link contains valid checkout URL pointing to sandbox.paypal.com.
- Zero funds are transferred from buyer accounts during the authorization phase.

## Gotchas
- Orders v2 authorizations expire after 29 days if uncaptured.
- Direct CAPTURE intent is prohibited and blocked by the TypeScript policy sandwich.
