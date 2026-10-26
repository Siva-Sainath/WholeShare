# PayPal Developer Agent Toolkit & API Integration Reference

This document defines the architectural integration between the PayPal Developer API platform, the `@paypal/agent-toolkit`, and Wholeshare multiparty group purchasing escrow.

## 1. Architectural Model & Commercial Lifecycle

Wholeshare coordinates autonomous small business buyers into pooled purchasing syndicates. The platform relies exclusively on native PayPal Developer primitives chained across three distinct commerce stages.

```
Stage 1: Mandates & Demand Discovery
  [ SME Buyer ] -> [ ACP Shared Payment Token ] -> [ Wholeshare Ingress Gateway ]

Stage 2: Negotiation & Soft Hold Escrow
  [ Autonomous Negotiation ] -> [ Orders v2 (intent: AUTHORIZE) ] -> [ Invoicing v2 Step-Up QR ]

Stage 3: Fulfillment & Batch Settlement
  [ Carrier Shipment Tracking ] -> [ Verified In-Transit ] -> [ Atomic Batch Capture ]
```

### Zero Upfront Deduction Guarantee
Wholeshare never charges buyer payment methods before wholesale order fulfillment. The platform uses PayPal Orders v2 with `intent: "AUTHORIZE"`. This soft authorization reserves the credit line of each syndicate member for 29 days without transferring cash. If a syndicate fails to reach supplier volume minimums, the soft authorizations lapse automatically with zero transaction fees.

### TypeScript Policy Sandwich
Every tool execution emitted by local language models passes through a deterministic interceptor before contacting PayPal Sandbox endpoints. This interceptor guarantees that:
1. Floating-point currency amounts are rejected immediately.
2. Orders v2 requests containing `intent: "CAPTURE"` are blocked and transformed to `AUTHORIZE`.
3. Member allocations exceeding signed ACP spend caps are rejected.
4. Allocations exceeding step-up thresholds require Invoicing v2 QR approval.

---

## 2. Complete 47-Tool Agent Toolkit Catalog

The `@paypal/agent-toolkit/ai-sdk` package exposes 47 distinct actions. Every action connects directly to PayPal Sandbox endpoints when initialized with valid sandbox credentials.

### Invoicing Tools (17 Actions)
Invoicing tools handle step-up KYC verification, bilateral invoicing, and audit records.

1. `create_invoice`: Creates draft or sent invoices under PayPal Invoicing v2.
2. `list_invoices`: Queries paginated invoice records from the merchant account.
3. `get_invoice`: Fetches detailed itemization, recipient, and status for a specific invoice ID.
4. `send_invoice`: Dispatches an invoice email with a hosted payment link to the recipient.
5. `send_invoice_reminder`: Sends an automated notification email for pending invoices.
6. `cancel_sent_invoice`: Revokes an active invoice and voids outstanding payment obligations.
7. `delete_invoice`: Deletes a draft invoice from the merchant ledger.
8. `setup_invoice_auto_reminders`: Configures scheduled reminder cadences before and after due dates.
9. `update_invoice_auto_reminder`: Modifies reminder frequencies and recipient lists.
10. `cancel_invoice_auto_reminder`: Disables automatic reminder delivery for an invoice.
11. `search_invoicing`: Searches invoices using keyword filters, dates, and amounts.
12. `update_invoicing`: Updates line items, amounts, or notes on existing draft invoices.
13. `generate_invoice_qr_code`: Emits a base64 encoded PNG QR code linking directly to invoice review.
14. `generate_invoice_number`: Generates an alphanumeric invoice sequence number.
15. `record_payment_for_invoice`: Logs an external or manual payment against an outstanding invoice.
16. `record_refund_for_invoice`: Records partial or full refund ledger events on paid invoices.
17. `create_conditional_rules_for_invoice`: Establishes conditional approval logic on high-value invoices.

### Recurring Series Tools (5 Actions)
Recurring series tools support recurring billing schedules.

18. `create_recurring_series`: Sets up a recurring billing schedule for predictable syndicate deliveries.
19. `activate_recurring_series`: Enables an inactive or paused recurring schedule.
20. `get_recurring_series`: Inspects current cycle counters and parameters for a series.
21. `cancel_recurring_series`: Terminates future billing instances under a recurring profile.
22. `delete_recurring_series`: Removes an unactivated series from the merchant account.

### Catalog Products Tools (4 Actions)
Catalog products represent wholesale commodities and syndicate order types.

23. `create_product`: Registers a new wholesale commodity in the PayPal product catalog.
24. `list_products`: Retrieves existing product records and descriptions.
25. `update_product`: Updates commodity classifications, names, or URLs.
26. `show_product_details`: Fetches technical attributes and creation timestamps for a product ID.

### Subscriptions Tools (8 Actions)
Subscriptions provide standing replenishment clans for cafes and bakeries.

27. `create_subscription_plan`: Creates a recurring billing plan with specified intervals and pricing.
28. `list_subscription_plans`: Queries active and inactive billing plans for a merchant.
29. `show_subscription_plan_details`: Reads tier pricing, grace periods, and setup fees for a plan.
30. `create_subscription`: Enrolls a buyer into an active billing plan.
31. `show_subscription_details`: Checks subscriber status, next billing date, and payment history.
32. `cancel_subscription`: Cancels subscriber enrollment with reason tracking.
33. `update_subscription`: Modifies shipping addresses or subscriber preferences.
34. `update_plan`: Updates plan pricing or descriptions.

### Carrier Shipment Tracking Tools (3 Actions)
Shipment tracking verification is the cryptographic gate for multi-party escrow release.

35. `create_shipment_tracking`: Registers a carrier tracking number and carrier code against an order.
36. `get_shipment_tracking`: Reads carrier milestones, in-transit timestamps, and delivery verification.
37. `update_shipment_tracking`: Updates tracking numbers or status notes prior to delivery.

### Orders & Payments Tools (6 Actions)
Orders tools govern soft hold authorizations and capture execution.

38. `create_order`: Creates a PayPal order. Wholeshare enforces intent AUTHORIZE.
39. `get_order`: Retrieves order status, authorized amounts, and payer details.
40. `pay_order`: Submits buyer payment details against an approved order.
41. `list_transactions`: Queries processed financial transaction logs and fees.
42. `create_refund`: Issues refunds on captured payments for mediated disputes.
43. `get_refund`: Inspects details and processing status of an issued refund.

### Disputes & Resolution Tools (3 Actions)
Disputes tools support multi-party arbitration and claim processing.

44. `list_disputes`: Queries open customer claims and chargebacks.
45. `get_dispute`: Fetches dispute reason, buyer claims, and required evidence deadlines.
46. `accept_dispute_claim`: Accepts a dispute claim and authorizes automated pro-rata settlement.

### Merchant Insights (1 Action)
47. `get_merchant_insights`: Reads aggregated transaction metrics and volume performance.

---

## 3. Resilience, Outage Handling & Timeout Standards

Wholeshare guarantees that no PayPal API latency spike can freeze backend event loops or corrupt local state.

### AbortController Timeouts
Every outbound HTTP request to `https://api-m.sandbox.paypal.com` wraps a native Node.js `AbortController`. The default timeout is 15 seconds. If PayPal does not respond within the deadline, the request aborts immediately and raises a structured `PAYPAL_TIMEOUT` error with HTTP status 504.

### Structured Error Classifications

| Error Code | HTTP Status | Root Cause | Recovery Action |
| :--- | :--- | :--- | :--- |
| `PAYPAL_TIMEOUT` | 504 | Request exceeded 15-second deadline | Retry with exponential backoff or inspect network latency. |
| `PAYPAL_NETWORK_ERROR` | 503 | DNS resolution or TCP connection drop | Inspect status at https://www.paypal-status.com. |
| `PAYPAL_AUTH_ERROR` | 401 | Invalid Client ID or Secret | Verify PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET in .env. |
| `PAYPAL_NOT_FOUND` | 404 | Target resource ID does not exist | Verify order ID or invoice ID format. |
| `PAYPAL_UNPROCESSABLE_ENTITY` | 422 | Incompatible payload or business rule violation | Inspect issue summary and debug ID in error details. |
| `PAYPAL_SERVER_ERROR` | 500/502/503 | Upstream PayPal service degradation | Pause transactions and refer to PayPal developer operations. |

### Explanatory Error Output
When an error occurs, Wholeshare outputs human-readable diagnostic messages with the exact PayPal Debug ID. The system never exposes raw stack traces or cryptic token dumps to users.

---

## 4. Verification Lever Reference

Drive and verify these capabilities using the dedicated verification CLI:

```bash
# Verify live sandbox OAuth2 handshake
node scripts/control-paypal.js doctor

# Execute soft hold authorization on Orders v2
node scripts/control-paypal.js order:authorize --amount 15000 --ref sme_austin_01

# Generate step-up KYC draft invoice with QR code
node scripts/control-paypal.js invoice:qr --amount 144000 --email buyer@wholeshare.local

# Create recurring clan replenishment plan
node scripts/control-paypal.js subscription:plan --amount 7500 --name "Weekly Flour Syndicate"

# Register carrier tracking number
node scripts/control-paypal.js tracking:register --order-id <ORDER_ID> --tracking 1Z9999999999999999 --carrier UPS

# List all 47 agent toolkit actions
node scripts/control-paypal.js toolkit:list

# Execute an action via agent toolkit
node scripts/control-paypal.js toolkit:execute --tool list_invoices

# Verify timeout resilience
node scripts/control-paypal.js simulate:timeout

# Verify network outage resilience
node scripts/control-paypal.js simulate:outage

# Verify authentication failure resilience
node scripts/control-paypal.js simulate:auth-fail
```
