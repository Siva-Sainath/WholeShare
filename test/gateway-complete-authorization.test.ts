import test, { describe, it } from "node:test";
import assert from "node:assert/strict";
import { PayPalMoneyGateway } from "../src/gateway/PayPalMoneyGateway.ts";

describe("PayPalMoneyGateway completeAuthorization Invariant Tests", () => {
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

  it("rejects authorization when order is still in 'CREATED' status without buyer approval", async () => {
    // Stub getOrder locally on the gateway instance to simulate an unapproved order
    gateway.getOrder = async (orderId: string) =>
      ({
        id: orderId,
        status: "CREATED",
        createTime: new Date().toISOString(),
      } as any);

    await assert.rejects(
      async () => {
        await gateway.completeAuthorization({
          orderId: "order-test-unapproved-01",
          clanId: "clan-1",
          memberId: "buyer-1",
        });
      },
      (err: Error) => {
        assert(err.message.includes("still in 'CREATED' status"));
        assert(err.message.includes("buyer must approve"));
        return true;
      }
    );
  });

  it("enforces 6-hour authorization window and rejects expired orders", async () => {
    // 7 hours ago
    const expiredTime = new Date(Date.now() - 7 * 60 * 60 * 1000).toISOString();

    gateway.getOrder = async (orderId: string) =>
      ({
        id: orderId,
        status: "APPROVED",
        createTime: expiredTime,
      } as any);

    await assert.rejects(
      async () => {
        await gateway.completeAuthorization({
          orderId: "order-test-expired-01",
          clanId: "clan-1",
          memberId: "buyer-1",
        });
      },
      (err: Error) => {
        assert(err.message.includes("authorization expired"));
        assert(err.message.includes("more than 6 hours ago"));
        return true;
      }
    );
  });
});
