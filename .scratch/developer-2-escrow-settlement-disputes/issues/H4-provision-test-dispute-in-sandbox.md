# H4: Provision Test Dispute in Sandbox Resolution Center

**What to build:** Provision a real dispute attached to a real captured payment transaction to the platform business account in the Sandbox Resolution Center so that the Customer Disputes API has a genuine dispute ID to query and negotiate against.

**Blocked by:** 05a: Thin Sandbox Path: Core Primitives

**Status:** completed

- [x] Use the real captured payment generated in Ticket 05a (which paid the platform business account).
- [x] Log in to the [PayPal Sandbox Customer Portal](https://www.sandbox.paypal.com) using the Sandbox Buyer account credentials.
- [x] Navigate to the Activity / Transaction history and find the completed transaction.
- [x] Click **Report a problem** / **Resolution Center** and open a dispute for "Item Not Received" or "Significantly Not As Described".
- [x] Confirm the dispute is created and copy the generated PayPal Dispute ID (`PP-R-OOA-10194658`).
- [x] Verify that a `GET /v1/customer/disputes/{id}` call returns status `INQUIRY` and record the real dispute ID for Ticket 10a.

## Verified Dispute Details
- Dispute ID: `PP-R-OOA-10194658`
- Dispute Lifecycle Stage: `INQUIRY`
- Dispute State: `UNDER_PAYPAL_REVIEW`
- Status: `UNDER_REVIEW`
- Seller Transaction ID: `74H63527HK822241U`
- Reason: `MERCHANDISE_OR_SERVICE_NOT_AS_DESCRIBED` (20 damaged flour bags)
- Disputed Amount: `$100.00 USD`
- Live GET verified: HTTP 200 via `GET /v1/customer/disputes/PP-R-OOA-10194658`.
