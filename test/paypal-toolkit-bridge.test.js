import test from "node:test";
import assert from "node:assert/strict";
import {
  getPayPalToolkit,
  getPayPalToolkitToolNames,
  executePayPalToolkitAction,
  resetPayPalToolkit
} from "../src/lib/paypal-toolkit-bridge.js";
import { PayPalConfigurationError } from "../src/lib/paypal-bridge.js";

const hasRealCredentials = Boolean(
  process.env.PAYPAL_CLIENT_ID &&
  process.env.PAYPAL_CLIENT_SECRET &&
  process.env.PAYPAL_CLIENT_ID !== "SANDBOX_MOCK_CLIENT_ID" &&
  !process.env.PAYPAL_CLIENT_ID.includes("your_sandbox")
);

test("executePayPalToolkitAction rejects direct CAPTURE intent via interceptor", async () => {
  const result = await executePayPalToolkitAction("create_order", {
    intent: "CAPTURE",
    amountCents: 1000
  });

  assert.equal(result.status, "REJECTED_BY_INTERCEPTOR");
  assert.equal(result.error, "INTERCEPTOR_VIOLATION");
  assert.ok(result.violations.some(v => v.includes("Direct CAPTURE is prohibited")));
});

test("executePayPalToolkitAction rejects floating point cents via interceptor", async () => {
  const result = await executePayPalToolkitAction("create_order", {
    intent: "AUTHORIZE",
    amountCents: 12.50
  });

  assert.equal(result.status, "REJECTED_BY_INTERCEPTOR");
  assert.equal(result.error, "INTERCEPTOR_VIOLATION");
  assert.ok(result.violations.some(v => v.includes("must be a positive integer")));
});

if (hasRealCredentials) {
  test("LIVE SANDBOX: getPayPalToolkit initializes and registers sandbox toolkit", () => {
    resetPayPalToolkit();
    const toolkit = getPayPalToolkit();
    assert.ok(toolkit);

    const names = getPayPalToolkitToolNames();
    assert.ok(names.length > 20);
    assert.ok(names.includes("create_order"));
    assert.ok(names.includes("create_invoice"));
  });
} else {
  test("getPayPalToolkit throws PayPalConfigurationError when credentials are not configured", () => {
    resetPayPalToolkit();
    assert.throws(
      () => {
        getPayPalToolkit();
      },
      err => {
        assert.ok(err instanceof PayPalConfigurationError);
        return true;
      }
    );
  });
}
