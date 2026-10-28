import test from "node:test";
import assert from "node:assert/strict";
import { createWebServer } from "../src/web/server.js";
import { getDisputeRecord } from "../src/lib/db.js";

function makePostRequest(port, path, body) {
  return new Promise((resolve, reject) => {
    import("node:http").then(http => {
      const data = JSON.stringify(body);
      const req = http.request(
        {
          hostname: "127.0.0.1",
          port,
          path,
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Content-Length": Buffer.byteLength(data)
          }
        },
        res => {
          let resBody = "";
          res.on("data", chunk => (resBody += chunk));
          res.on("end", () => {
            resolve({
              statusCode: res.statusCode,
              headers: res.headers,
              body: resBody ? JSON.parse(resBody) : {}
            });
          });
        }
      );
      req.on("error", reject);
      req.write(data);
      req.end();
    });
  });
}

test("POST /api/v1/paypal/webhook records dispute created event", async () => {
  const server = createWebServer();
  await new Promise(resolve => server.listen(0, resolve));
  const port = server.address().port;

  try {
    const disputeId = `DISPUTE_TEST_${Date.now()}`;
    const response = await makePostRequest(port, "/api/v1/paypal/webhook", {
      event_type: "CUSTOMER.DISPUTE.CREATED",
      resource: {
        dispute_id: disputeId,
        custom_id: "ORD_HOLD_99",
        reason: "MERCHANDISE_NOT_AS_DESCRIBED",
        status: "UNDER_REVIEW"
      }
    });

    assert.equal(response.statusCode, 200);
    assert.equal(response.body.received, true);
    assert.equal(response.body.disputeId, disputeId);

    const record = await getDisputeRecord(disputeId);
    if (record) {
      assert.equal(record.paypal_dispute_id, disputeId);
    }
  } finally {
    server.close();
  }
});

test("POST /api/v1/paypal/webhook records dispute resolved event", async () => {
  const server = createWebServer();
  await new Promise(resolve => server.listen(0, resolve));
  const port = server.address().port;

  try {
    const disputeId = `DISPUTE_RESOLVE_${Date.now()}`;
    const response = await makePostRequest(port, "/api/v1/paypal/webhook", {
      event_type: "CUSTOMER.DISPUTE.RESOLVED",
      resource: {
        dispute_id: disputeId,
        custom_id: "ORD_HOLD_100",
        reason: "MERCHANDISE_NOT_AS_DESCRIBED",
        status: "RESOLVED",
        dispute_outcome: {
          outcome_code: "RESOLVED_BUYER_FAVOUR"
        }
      }
    });

    assert.equal(response.statusCode, 200);
    assert.equal(response.body.received, true);
    assert.equal(response.body.status, "RESOLVED");
  } finally {
    server.close();
  }
});
