import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { handleBotIngressMandate, signEgressPayload, formatSseEvent } from "../src/lib/gateway.js";

const testSecret = "wholeshare-test-secret-key-32bytes!";

function makeSignedHeaders(rawBody, secret = testSecret, timestampOffsetSec = 0) {
  const timestamp = Math.floor(Date.now() / 1000) + timestampOffsetSec;
  const signature = crypto
    .createHmac("sha256", secret)
    .update(`${timestamp}.${rawBody}`)
    .digest("hex");

  return {
    "x-wholeshare-signature": signature,
    "x-wholeshare-timestamp": String(timestamp)
  };
}

test("handles valid bot ingress mandate and returns HTTP 202 Accepted", () => {
  const body = {
    buyerId: "sme_grok_buyer_01",
    buyerName: "Grok Wholesale Baker",
    buyerEmail: "baker@example.com",
    sku: "organic-flour-50lb",
    requestedUnits: 200,
    maxSpendCents: 240000,
    stepUpThresholdCents: 100000,
    callbackUrl: "https://grokbot.local/webhook"
  };

  const rawBody = JSON.stringify(body);
  const headers = makeSignedHeaders(rawBody);

  const result = handleBotIngressMandate(headers, body, rawBody, testSecret);
  assert.equal(result.status, 202);
  assert.equal(result.response.status, "ACCEPTED");
  assert.equal(result.response.buyerId, body.buyerId);
  assert.equal(result.response.callbackRegistered, true);
  assert.ok(result.response.sharedPaymentToken.startsWith("spt_"));
});

test("rejects bot ingress with stale timestamp", () => {
  const body = {
    buyerId: "sme_stale_bot",
    sku: "organic-flour-50lb",
    requestedUnits: 100,
    maxSpendCents: 120000
  };

  const rawBody = JSON.stringify(body);
  const headers = makeSignedHeaders(rawBody, testSecret, -400);

  const result = handleBotIngressMandate(headers, body, rawBody, testSecret);
  assert.equal(result.status, 401);
  assert.equal(result.response.error, "UNAUTHORIZED");
});

test("rejects bot ingress with forged signature", () => {
  const body = {
    buyerId: "sme_hostile_bot",
    sku: "organic-flour-50lb",
    requestedUnits: 100,
    maxSpendCents: 120000
  };

  const rawBody = JSON.stringify(body);
  const headers = {
    "x-wholeshare-signature": "a".repeat(64),
    "x-wholeshare-timestamp": String(Math.floor(Date.now() / 1000))
  };

  const result = handleBotIngressMandate(headers, body, rawBody, testSecret);
  assert.equal(result.status, 401);
  assert.equal(result.response.error, "UNAUTHORIZED");
});

test("signs egress webhook payload for external bot dispatch", () => {
  const egress = signEgressPayload(
    "wholeshare.coalition.threshold_met",
    { coalitionId: "coalition_101", targetUnits: 1000, currentUnits: 1300 },
    testSecret
  );

  assert.ok(egress.headers["X-Wholeshare-Signature"]);
  assert.ok(egress.headers["X-Wholeshare-Timestamp"]);
  assert.ok(egress.body.includes("wholeshare.coalition.threshold_met"));
});

test("formats Server-Sent Events cleanly", () => {
  const sse = formatSseEvent("COALITION_UPDATE", { status: "LOCKED" });
  assert.equal(sse, 'event: COALITION_UPDATE\ndata: {"status":"LOCKED"}\n\n');
});
