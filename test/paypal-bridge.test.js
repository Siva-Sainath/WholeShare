import test from "node:test";
import assert from "node:assert/strict";
import {
  createOrderAuthorization,
  authorizeOrderHold,
  captureOrderHold,
  generateInvoiceWithQr,
  registerShipmentTracking,
  getPayPalAccessToken,
  PayPalConfigurationError,
  PayPalApiError,
  resetPayPalTokenCache
} from "../src/lib/paypal-bridge.js";

const hasRealCredentials = Boolean(
  process.env.PAYPAL_CLIENT_ID &&
  process.env.PAYPAL_CLIENT_SECRET &&
  process.env.PAYPAL_CLIENT_ID !== "SANDBOX_MOCK_CLIENT_ID" &&
  !process.env.PAYPAL_CLIENT_ID.includes("your_sandbox")
);

test("createOrderAuthorization rejects non-integer amount cents", async () => {
  await assert.rejects(
    async () => {
      await createOrderAuthorization({ amountCents: 14.50 });
    },
    /amountCents must be a positive integer/
  );
});

test("createOrderAuthorization rejects negative amount cents", async () => {
  await assert.rejects(
    async () => {
      await createOrderAuthorization({ amountCents: -500 });
    },
    /amountCents must be a positive integer/
  );
});

test("createOrderAuthorization fails fast without mock token fallback when unconfigured", async () => {
  resetPayPalTokenCache();
  const origId = process.env.PAYPAL_CLIENT_ID;
  try {
    process.env.PAYPAL_CLIENT_ID = "SANDBOX_MOCK_CLIENT_ID";
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
    process.env.PAYPAL_CLIENT_ID = origId;
    resetPayPalTokenCache();
  }
});

test("authorizeOrderHold fails fast when orderId is missing", async () => {
  await assert.rejects(
    async () => {
      await authorizeOrderHold({ orderId: "" });
    },
    /orderId is required/
  );
});

test("captureOrderHold fails fast when authorizationId is missing", async () => {
  await assert.rejects(
    async () => {
      await captureOrderHold({ authorizationId: "", amountCents: 1000 });
    },
    /authorizationId is required/
  );
});

test("registerShipmentTracking fails fast when trackingNumber is missing", async () => {
  await assert.rejects(
    async () => {
      await registerShipmentTracking({ trackingNumber: "" });
    },
    /trackingNumber is required/
  );
});

// Live Sandbox Integration Suite (Executes only when real sandbox keys exist in .env)
if (hasRealCredentials) {
  test("LIVE SANDBOX: creates a real order authorization with intent: AUTHORIZE", async () => {
    const result = await createOrderAuthorization({
      amountCents: 144000,
      currency: "USD",
      referenceId: "sme_live_test"
    });

    assert.equal(result.intent, "AUTHORIZE");
    assert.equal(result.amountCents, 144000);
    assert.ok(result.orderId);
    assert.ok(Array.isArray(result.links));
  });

  test("TIMEOUT RESILIENCE: aborts gracefully and throws PAYPAL_TIMEOUT when timeout expires", async () => {
    resetPayPalTokenCache();
    await assert.rejects(
      async () => {
        await getPayPalAccessToken(1);
      },
      (err) => {
        assert.equal(err.name, "PayPalApiError");
        assert.equal(err.code, "PAYPAL_TIMEOUT");
        assert.equal(err.status, 504);
        assert.match(err.message, /timed out/);
        return true;
      }
    );
  });
}
