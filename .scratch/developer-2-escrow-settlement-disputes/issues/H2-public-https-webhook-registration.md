# H2: Public HTTPS Endpoint & Webhook Registration

**What to build:** Configure a publicly accessible HTTPS endpoint on port 443 and register it in the PayPal Developer Dashboard to obtain the `PAYPAL_WEBHOOK_ID` required for webhook signature verification.

**Blocked by:** H1: Provision Sandbox Accounts & .env

**Status:** completed

- [x] Expose the application webhook listener over public HTTPS on port 443 (e.g., using a Render deployment, cloud hosting, or secure tunnel).
- [x] In the PayPal Developer Dashboard under your Sandbox App, click **Add Webhook**.
- [x] Enter the public URL (e.g., `https://<domain>/api/webhooks/paypal`).
- [x] Subscribe to all payment and dispute event types (`PAYMENT.CAPTURE.COMPLETED`, `PAYMENT.AUTHORIZATION.VOIDED`, `CUSTOMER.DISPUTE.*`).
- [x] Copy the generated Webhook ID and save it as `PAYPAL_WEBHOOK_ID` in `d:\paypal\.env`.

## Comments
- Registered webhook ID `3T268446FF552533R` populated in `.env`.
