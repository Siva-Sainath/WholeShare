# H3: Enable PayPal Payouts Sandbox Feature

**What to build:** Enable the PayPal Payouts capability for the Sandbox REST App in the PayPal Developer Dashboard and document the exact dashboard steps seen.

**Blocked by:** H1: Provision Sandbox Accounts & .env

**Status:** completed

- [x] Log in to the [PayPal Developer Dashboard](https://developer.paypal.com/dashboard/applications/sandbox).
- [x] Select your SyndicatePay Sandbox REST Application.
- [x] Inspect the page and record the exact dashboard navigation steps seen (e.g., under App Settings -> Features).
- [x] Enable the **Payouts** checkbox / toggle to grant permission to call `POST /v1/payments/payouts`.
- [x] Save changes and confirm Payouts capability is active for your Sandbox Client ID.
