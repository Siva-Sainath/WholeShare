# H1: Provision Sandbox Accounts & .env

**What to build:** Provision the necessary Sandbox accounts in the PayPal Developer Dashboard and configure the initial `.env` file so that live REST calls against `api-m.sandbox.paypal.com` can authenticate.

**Blocked by:** None (can start immediately)

**Status:** completed

- [x] Log in to the [PayPal Developer Dashboard](https://developer.paypal.com/dashboard/accounts).
- [x] Create a **Platform Business Account** (receives escrow authorizations, captures, and manages platform disputes).
- [x] Create a **Wholesale Supplier Business Account** (receives payouts and supplies goods).
- [x] Create 4 **Buyer Accounts** (personal or business sandbox accounts with simulated balances for Maria and clan members).
- [x] Navigate to **Apps & Credentials -> Sandbox**, select or create the REST App for the Platform account, and copy `PAYPAL_CLIENT_ID` and `PAYPAL_CLIENT_SECRET`.
- [x] Populate `PAYPAL_CLIENT_ID` and `PAYPAL_CLIENT_SECRET` in `d:\paypal\.env`.
