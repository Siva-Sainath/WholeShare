// Loaded before the unit tests (node --import). The gateway refuses to start without PayPal configuration, so the tests
// supply harmless sandbox placeholders when no .env is present. They never reach PayPal: the tests inject their own clients.
const defaults = {
  PAYPAL_MODE: "sandbox",
  PAYPAL_CLIENT_ID: "test-client-id",
  PAYPAL_CLIENT_SECRET: "test-client-secret",
  PAYPAL_BASE_URL: "https://api-m.sandbox.paypal.com",
  PAYPAL_KEY_RETENTION_HOURS: "72",
  MAX_PENDING_RECHECK_COUNT: "5",
  AUTHORIZATION_VALIDITY_DAYS: "29",
  SYNDICATE_HMAC_SECRET: "test-hmac-secret-that-is-long-enough-for-tests"
};
for (const [key, value] of Object.entries(defaults)) {
  if (!process.env[key]) process.env[key] = value;
}
