import test from "node:test";
import assert from "node:assert/strict";
import {
  getPayPalAccessToken,
  createOrderAuthorization,
  authorizeOrderHold,
  captureOrderHold,
  PayPalConfigurationError,
  resetPayPalTokenCache
} from "../src/lib/paypal-bridge.js";
import { getPayPalToolkit, resetPayPalToolkit } from "../src/lib/paypal-toolkit-bridge.js";

test("getPayPalAccessToken throws PayPalConfigurationError when credentials are placeholder", async () => {
  resetPayPalTokenCache();
  const originalId = process.env.PAYPAL_CLIENT_ID;
  const originalSecret = process.env.PAYPAL_CLIENT_SECRET;

  try {
    process.env.PAYPAL_CLIENT_ID = "SANDBOX_MOCK_CLIENT_ID";
    process.env.PAYPAL_CLIENT_SECRET = "SANDBOX_MOCK_SECRET";

    await assert.rejects(
      async () => {
        await getPayPalAccessToken();
      },
      err => {
        assert.ok(err instanceof PayPalConfigurationError);
        assert.ok(err.message.includes("developer.paypal.com"));
        return true;
      }
    );
  } finally {
    process.env.PAYPAL_CLIENT_ID = originalId;
    process.env.PAYPAL_CLIENT_SECRET = originalSecret;
    resetPayPalTokenCache();
  }
});

test("createOrderAuthorization rejects without mock token fallback", async () => {
  resetPayPalTokenCache();
  const originalId = process.env.PAYPAL_CLIENT_ID;

  try {
    process.env.PAYPAL_CLIENT_ID = "";

    await assert.rejects(
      async () => {
        await createOrderAuthorization({ amountCents: 10000 });
      },
      err => {
        assert.ok(err instanceof PayPalConfigurationError);
        return true;
      }
    );
  } finally {
    process.env.PAYPAL_CLIENT_ID = originalId;
    resetPayPalTokenCache();
  }
});

test("authorizeOrderHold requires valid orderId and real credentials", async () => {
  resetPayPalTokenCache();
  await assert.rejects(
    async () => {
      await authorizeOrderHold({ orderId: "" });
    },
    /orderId is required/
  );
});

test("captureOrderHold requires valid authorizationId and real credentials", async () => {
  resetPayPalTokenCache();
  await assert.rejects(
    async () => {
      await captureOrderHold({ authorizationId: "", amountCents: 5000 });
    },
    /authorizationId is required/
  );
});

test("getPayPalToolkit throws PayPalConfigurationError when credentials are placeholder", () => {
  resetPayPalToolkit();
  const originalId = process.env.PAYPAL_CLIENT_ID;

  try {
    process.env.PAYPAL_CLIENT_ID = "SANDBOX_MOCK_CLIENT_ID";
    assert.throws(
      () => {
        getPayPalToolkit();
      },
      err => {
        assert.ok(err instanceof PayPalConfigurationError);
        assert.ok(err.message.includes("Cannot initialize @paypal/agent-toolkit"));
        return true;
      }
    );
  } finally {
    process.env.PAYPAL_CLIENT_ID = originalId;
    resetPayPalToolkit();
  }
});
