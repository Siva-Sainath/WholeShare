import test, { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  PayPalMoneyGateway,
  SpendingLimitExceededError,
} from "../src/gateway/PayPalMoneyGateway.ts";

describe("PayPalMoneyGateway Spending Limits and Invariant Tests", () => {
  const dummyConfig = {
    mode: "sandbox" as const,
    clientId: "test-client-id",
    clientSecret: "test-client-secret",
    baseUrl: "https://api-m.sandbox.paypal.com",
    webhookId: null,
    port: 3000,
    keyRetentionHours: 72,
    maxPendingRecheckCount: 5,
    authorizationValidityDays: 29,
    reconciliationPollIntervalSeconds: 300,
    inspectionWindowHours: 48,
    PAYPAL_MODE: "sandbox" as const,
    PAYPAL_CLIENT_ID: "test-client-id",
    PAYPAL_CLIENT_SECRET: "test-client-secret",
    PAYPAL_BASE_URL: "https://api-m.sandbox.paypal.com",
    PAYPAL_WEBHOOK_ID: null,
    PORT: 3000,
    PAYPAL_KEY_RETENTION_HOURS: 72,
    MAX_PENDING_RECHECK_COUNT: 5,
    AUTHORIZATION_VALIDITY_DAYS: 29,
    RECONCILIATION_POLL_INTERVAL_SECONDS: 300,
    INSPECTION_WINDOW_HOURS: 48,
  };

  const gateway = new PayPalMoneyGateway(dummyConfig);

  it("passes when unitPrice <= quote and orderAmount <= maxAutoAuthorizeUsd", () => {
    const amount = gateway.validateSpendingLimits({
      clanId: "clan-1",
      memberId: "member-1",
      quantity: 100,
      unitPrice: 7.20,
      quoteUnitPrice: 7.20,
      maxAutoAuthorizeUsd: 1000.00,
    });

    assert.equal(amount, 720.00);
  });

  it("refuses orders when unitPrice exceeds quote", () => {
    assert.throws(
      () =>
        gateway.validateSpendingLimits({
          clanId: "clan-1",
          memberId: "member-1",
          quantity: 100,
          unitPrice: 7.50,
          quoteUnitPrice: 7.20,
          maxAutoAuthorizeUsd: 1000.00,
        }),
      (err: Error) => {
        assert(err instanceof SpendingLimitExceededError);
        assert.equal(err.code, "UNIT_PRICE_EXCEEDS_QUOTE");
        assert(err.message.includes("exceeds quote"));
        return true;
      }
    );
  });

  it("refuses orders when orderAmount exceeds maxAutoAuthorizeUsd", () => {
    assert.throws(
      () =>
        gateway.validateSpendingLimits({
          clanId: "clan-1",
          memberId: "member-1",
          quantity: 200,
          unitPrice: 7.20,
          quoteUnitPrice: 7.20,
          maxAutoAuthorizeUsd: 1000.00, // 200 * 7.20 = 1440 > 1000
        }),
      (err: Error) => {
        assert(err instanceof SpendingLimitExceededError);
        assert.equal(err.code, "AMOUNT_EXCEEDS_AUTO_SPENDING_LIMIT");
        assert(err.message.includes("exceeds auto-authorize spending cap"));
        return true;
      }
    );
  });

  it("allows higher auto authorize spending cap when explicit human limit configured", () => {
    const amount = gateway.validateSpendingLimits({
      clanId: "clan-1",
      memberId: "member-maria",
      quantity: 200,
      unitPrice: 7.20,
      quoteUnitPrice: 7.20,
      maxAutoAuthorizeUsd: 1500.00, // 1440 <= 1500
    });

    assert.equal(amount, 1440.00);
  });
});
