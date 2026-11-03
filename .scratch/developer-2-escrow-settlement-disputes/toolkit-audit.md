# Audit of `@paypal/agent-toolkit` (Version 1.11.0)

Audit performed against source code in `node_modules/@paypal/agent-toolkit/ai-sdk/index.js` and `package.json`.

## Package Summary
- **Installed Version**: `1.11.0`
- **Total Registered Tools**: 47
- **Inspection Basis**: Direct static source code analysis of `ai-sdk/index.js` and runtime inspection of tool metadata and Zod schemas.

---

## 1. Specification Operations Coverage Matrix

| Required Operation | Spec Need | Toolkit Tool Name | PayPal API Endpoint Called | Status | Implementation Directives |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Authorize Hold** | Create order with `intent: "AUTHORIZE"` | `create_order` | `POST /v2/checkout/orders` | **NOT COVERED** | Toolkit source hardcodes `intent: "CAPTURE"`. Must use typed client. |
| **Capture with `final_capture`** | Capture authorization with `final_capture: true` & custom amount | `pay_order` | `POST /v2/checkout/orders/{id}/capture` | **NOT COVERED** | `pay_order` calls checkout capture with empty payload `{}`. Does not support `POST /v2/payments/authorizations/{id}/capture`, custom amounts, or `final_capture`. Must use typed client. |
| **Void** | Void authorization hold | *(None)* | `POST /v2/payments/authorizations/{id}/void` | **NOT COVERED** | No tool exists in toolkit. Must use typed client. |
| **Reauthorize** | Refresh 3-day honor period | *(None)* | `POST /v2/payments/authorizations/{id}/reauthorize` | **NOT COVERED** | No tool exists in toolkit. Must use typed client. |
| **Refund** | Refund payment from capture | `create_refund`, `get_refund` | `POST /v2/payments/captures/{id}/refund`, `GET /v2/payments/refunds/{id}` | **COVERED** | Covered by toolkit tools. |
| **Tracking** | Register and query parcel tracking | `create_shipment_tracking`, `get_shipment_tracking`, `update_shipment_tracking` | `POST /v1/shipping/trackers-batch`, `GET /v1/shipping/trackers/{id}`, `PUT /v1/shipping/trackers/{id}` | **COVERED (PARTIAL)** | Uses deprecated `/v1/shipping/trackers-batch`. For Orders v2 `POST /v2/checkout/orders/{id}/track`, use typed client. `get_shipment_tracking` is usable for reading. |
| **Payouts** | Single and batch payouts to suppliers | *(None)* | `POST /v1/payments/payouts` | **NOT COVERED** | No tool exists in toolkit. Must use typed client. |
| **List and Get Dispute** | Query disputes and case details | `list_disputes`, `get_dispute` | `GET /v1/customer/disputes`, `GET /v1/customer/disputes/{id}` | **COVERED** | Covered by toolkit tools. |
| **Accept Claim** | Accept buyer dispute claim liability | `accept_dispute_claim` | `POST /v1/customer/disputes/{id}/accept-claim` | **COVERED** | Covered by toolkit tool. |
| **Make Offer** | Submit formal settlement counter-offer | *(None)* | `POST /v1/customer/disputes/{id}/make-offer` | **NOT COVERED** | No tool exists in toolkit. Must use typed client. |
| **Provide Evidence** | Upload dispute damage proof & text | *(None)* | `POST /v1/customer/disputes/{id}/provide-evidence` | **NOT COVERED** | No tool exists in toolkit. Must use typed client. |
| **Webhook Verification** | Cryptographic signature validation | *(None)* | `POST /v1/notifications/verify-webhook-signature` | **NOT COVERED** | No tool exists in toolkit. Must use typed client or local crypto. |

---

## 2. In-Depth Analysis of Critical Escrow Primitives

### A. Authorize Hold (`create_order`)
Source inspection of `create_order` in `node_modules/@paypal/agent-toolkit/ai-sdk/index.js` reveals:
```javascript
// index.js line 277:89819
y = { intent: "CAPTURE", purchase_units: [...] }
```
The parameter schema accepted by `create_order` only exposes:
`['currencyCode', 'items', 'discount', 'shippingCost', 'shippingAddress', 'notes', 'returnUrl', 'cancelUrl']`.
There is no `intent` parameter. Calling `create_order` always sets `intent: "CAPTURE"` and immediately debits the card upon checkout approval.
**Conclusion**: `create_order` cannot be used for multi-party escrow holds. The gateway must use the APIMatic typed client to execute `POST /v2/checkout/orders` with `intent: "AUTHORIZE"`.

### B. Final Batch Capture (`pay_order`)
Source inspection of `pay_order` in `node_modules/@paypal/agent-toolkit/ai-sdk/index.js` reveals:
```javascript
let s = `${e.getBaseUrl()}/v2/checkout/orders/${r.id}/capture`;
let o = await l.default.post(s, {}, { headers: await e.getHeaders() });
```
`pay_order` only accepts `{ id: string }` and calls the Checkout Orders capture endpoint with an empty JSON object. It does not call the Payments v2 Authorization capture endpoint (`/v2/payments/authorizations/{id}/capture`), cannot specify capture amounts below the authorization hold, and cannot supply the `final_capture: true` flag.
**Conclusion**: `pay_order` cannot execute final batch captures at discounted wholesale tiers. The gateway must use the APIMatic typed client.

---

## 3. Complete Inventory of All 47 Toolkit Tools

1. `create_invoice`: `POST /v2/invoicing/invoices`
2. `create_recurring_series`: `POST /v2/invoicing/recurring-invoices`
3. `activate_recurring_series`: `POST /v2/invoicing/recurring-invoices/{id}/activate`
4. `get_recurring_series`: `GET /v2/invoicing/recurring-invoices/{id}`
5. `cancel_recurring_series`: `POST /v2/invoicing/recurring-invoices/{id}/cancel`
6. `delete_recurring_series`: `DELETE /v2/invoicing/recurring-invoices/{id}`
7. `list_invoices`: `GET /v2/invoicing/invoices`
8. `get_invoice`: `GET /v2/invoicing/invoices/{id}`
9. `send_invoice`: `POST /v2/invoicing/invoices/{id}/send`
10. `send_invoice_reminder`: `POST /v2/invoicing/invoices/{id}/remind`
11. `cancel_sent_invoice`: `POST /v2/invoicing/invoices/{id}/cancel`
12. `delete_invoice`: `DELETE /v2/invoicing/invoices/{id}`
13. `setup_invoice_auto_reminders`: `POST /v2/invoicing/setup-reminders`
14. `update_invoice_auto_reminder`: `PUT /v2/invoicing/reminders/{id}`
15. `search_invoicing`: `POST /v2/invoicing/search-invoices`
16. `update_invoicing`: `PUT /v2/invoicing/invoices/{id}`
17. `cancel_invoice_auto_reminder`: `DELETE /v2/invoicing/reminders/{id}`
18. `generate_invoice_qr_code`: `POST /v2/invoicing/invoices/{id}/generate-qr-code`
19. `generate_invoice_number`: `POST /v2/invoicing/generate-next-invoice-number`
20. `record_payment_for_invoice`: `POST /v2/invoicing/invoices/{id}/payments`
21. `record_refund_for_invoice`: `POST /v2/invoicing/invoices/{id}/refunds`
22. `create_conditional_rules_for_invoice`: `POST /v2/invoicing/invoices/{id}`
23. `create_product`: `POST /v1/catalogs/products`
24. `list_products`: `GET /v1/catalogs/products`
25. `update_product`: `PATCH /v1/catalogs/products/{id}`
26. `show_product_details`: `GET /v1/catalogs/products/{id}`
27. `create_subscription_plan`: `POST /v1/billing/plans`
28. `list_subscription_plans`: `GET /v1/billing/plans`
29. `show_subscription_plan_details`: `GET /v1/billing/plans/{id}`
30. `create_subscription`: `POST /v1/billing/subscriptions`
31. `show_subscription_details`: `GET /v1/billing/subscriptions/{id}`
32. `cancel_subscription`: `POST /v1/billing/subscriptions/{id}/cancel`
33. `update_subscription`: `PATCH /v1/billing/subscriptions/{id}`
34. `create_shipment_tracking`: `POST /v1/shipping/trackers-batch`
35. `get_shipment_tracking`: `GET /v1/shipping/trackers/{id}`
36. `update_shipment_tracking`: `PUT /v1/shipping/trackers/{id}`
37. `create_order`: `POST /v2/checkout/orders` (hardcoded `intent: "CAPTURE"`)
38. `get_order`: `GET /v2/checkout/orders/{id}`
39. `pay_order`: `POST /v2/checkout/orders/{id}/capture` (empty body)
40. `list_disputes`: `GET /v1/customer/disputes`
41. `get_dispute`: `GET /v1/customer/disputes/{id}`
42. `accept_dispute_claim`: `POST /v1/customer/disputes/{id}/accept-claim`
43. `list_transactions`: `GET /v1/reporting/transactions`
44. `update_plan`: `PATCH /v1/billing/plans/{id}`
45. `create_refund`: `POST /v2/payments/captures/{id}/refund`
46. `get_refund`: `GET /v2/payments/refunds/{id}`
47. `get_merchant_insights`: `GET /v1/merchant/insights`
