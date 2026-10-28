import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { interceptNegotiationProposal, interceptToolExecution } from "../src/lib/interceptor.js";
import { verifyIngressSignature } from "../src/lib/gateway.js";
import { createSharedPaymentToken, verifySharedPaymentToken } from "../src/lib/token.js";
import { transitionCoalitionState, canTransition } from "../src/lib/fsm.js";

const mockContext = {
  catalogPriceCents: 1000,
  mandates: new Map([
    ["sme_austin_01", { maxSpendCents: 150000, stepUpThresholdCents: 100000 }],
    ["sme_bean_02", { maxSpendCents: 300000, stepUpThresholdCents: 200000 }],
    ["sme_green_03", { maxSpendCents: 100000, stepUpThresholdCents: 80000 }]
  ])
};

test("Gauntlet Vector 1: rejects floating cents in negotiation proposal", () => {
  const proposal = {
    coalitionId: "coalition_flour_01",
    sku: "organic-flour-50lb",
    totalUnits: 500,
    unitPriceCents: 7.20,
    discountPct: 28,
    intent: "AUTHORIZE",
    idempotencyKey: "nonce_secure_1234",
    allocations: [
      { buyerId: "sme_austin_01", units: 250, amountCents: 180000, stepUpRequired: true },
      { buyerId: "sme_bean_02", units: 250, amountCents: 180000, stepUpRequired: true }
    ]
  };

  const result = interceptNegotiationProposal(proposal, mockContext);
  assert.equal(result.valid, false);
  assert.ok(result.violations.some(v => v.includes("positive integers")));
});

test("Gauntlet Vector 2: rejects floating cents in tool execution arguments", () => {
  const result = interceptToolExecution("create_order", {
    intent: "AUTHORIZE",
    amountCents: 54.32
  });
  assert.equal(result.valid, false);
  assert.ok(result.violations.some(v => v.includes("positive integer")));
});

test("Gauntlet Vector 3: rejects negative volume in join_syndicate", () => {
  const result = interceptToolExecution("join_syndicate", {
    smeId: "sme_austin_01",
    sku: "organic-flour-50lb",
    units: -50
  });
  assert.equal(result.valid, false);
  assert.ok(result.violations.some(v => v.includes("positive integer")));
});

test("Gauntlet Vector 4: rejects direct CAPTURE intent in create_order tool", () => {
  const result = interceptToolExecution("create_order", {
    intent: "CAPTURE",
    amountCents: 10000
  });
  assert.equal(result.valid, false);
  assert.ok(result.violations.some(v => v.includes("strictly be 'AUTHORIZE'")));
});

test("Gauntlet Vector 5: rejects direct CAPTURE intent in coalition proposal", () => {
  const proposal = {
    coalitionId: "coalition_flour_01",
    sku: "organic-flour-50lb",
    totalUnits: 500,
    unitPriceCents: 720,
    discountPct: 28,
    intent: "CAPTURE",
    idempotencyKey: "nonce_secure_1234",
    allocations: [
      { buyerId: "sme_austin_01", units: 250, amountCents: 180000, stepUpRequired: true },
      { buyerId: "sme_bean_02", units: 250, amountCents: 180000, stepUpRequired: false }
    ]
  };

  const result = interceptNegotiationProposal(proposal, mockContext);
  assert.equal(result.valid, false);
  assert.ok(result.violations.some(v => v.includes("strictly be 'AUTHORIZE'")));
});

test("Gauntlet Vector 6: rejects unit price exceeding wholesale catalog base price", () => {
  const proposal = {
    coalitionId: "coalition_flour_01",
    sku: "organic-flour-50lb",
    totalUnits: 500,
    unitPriceCents: 1400,
    discountPct: 0,
    intent: "AUTHORIZE",
    idempotencyKey: "nonce_secure_1234",
    allocations: [
      { buyerId: "sme_austin_01", units: 250, amountCents: 350000, stepUpRequired: true },
      { buyerId: "sme_bean_02", units: 250, amountCents: 350000, stepUpRequired: true }
    ]
  };

  const result = interceptNegotiationProposal(proposal, mockContext);
  assert.equal(result.valid, false);
  assert.ok(result.violations.some(v => v.includes("exceeds catalog price")));
});

test("Gauntlet Vector 7: rejects member allocation exceeding buyer spend cap", () => {
  const proposal = {
    coalitionId: "coalition_flour_01",
    sku: "organic-flour-50lb",
    totalUnits: 500,
    unitPriceCents: 720,
    discountPct: 28,
    intent: "AUTHORIZE",
    idempotencyKey: "nonce_secure_1234",
    allocations: [
      { buyerId: "sme_austin_01", units: 300, amountCents: 216000, stepUpRequired: true },
      { buyerId: "sme_bean_02", units: 200, amountCents: 144000, stepUpRequired: false }
    ]
  };

  const result = interceptNegotiationProposal(proposal, mockContext);
  assert.equal(result.valid, false);
  assert.ok(result.violations.some(v => v.includes("exceeds mandate cap")));
});

test("Gauntlet Vector 8: flags buyer allocation exceeding step-up threshold without step-up flag", () => {
  const proposal = {
    coalitionId: "coalition_flour_01",
    sku: "organic-flour-50lb",
    totalUnits: 300,
    unitPriceCents: 720,
    discountPct: 28,
    intent: "AUTHORIZE",
    idempotencyKey: "nonce_secure_1234",
    allocations: [
      { buyerId: "sme_austin_01", units: 150, amountCents: 108000, stepUpRequired: false },
      { buyerId: "sme_green_03", units: 150, amountCents: 108000, stepUpRequired: true }
    ]
  };

  const result = interceptNegotiationProposal(proposal, mockContext);
  assert.equal(result.valid, false);
  assert.ok(result.violations.some(v => v.includes("exceeds threshold without step-up flag")));
});

test("Gauntlet Vector 9: rejects ingress mandate with stale timestamp beyond replay window", () => {
  const secret = "test-secret-key-32b-length-ok";
  const staleTimestamp = Math.floor(Date.now() / 1000) - 500;
  const rawBody = JSON.stringify({ buyerId: "sme_attack_01" });
  const sig = crypto.createHmac("sha256", secret).update(`${staleTimestamp}.${rawBody}`).digest("hex");

  const headers = {
    "x-wholeshare-signature": sig,
    "x-wholeshare-timestamp": String(staleTimestamp)
  };

  const verification = verifyIngressSignature(headers, rawBody, secret);
  assert.equal(verification.valid, false);
  assert.ok(verification.reason.includes("replay window"));
});

test("Gauntlet Vector 10: rejects ingress mandate with forged HMAC signature", () => {
  const secret = "test-secret-key-32b-length-ok";
  const now = Math.floor(Date.now() / 1000);
  const rawBody = JSON.stringify({ buyerId: "sme_attack_01" });
  const forgedSig = crypto.randomBytes(32).toString("hex");

  const headers = {
    "x-wholeshare-signature": forgedSig,
    "x-wholeshare-timestamp": String(now)
  };

  const verification = verifyIngressSignature(headers, rawBody, secret);
  assert.equal(verification.valid, false);
  assert.ok(verification.reason.includes("Signature mismatch"));
});

test("Gauntlet Vector 11: rejects ACP token when buyer ID is tampered", () => {
  const token = createSharedPaymentToken({
    buyerId: "sme_austin_01",
    sku: "organic-flour-50lb",
    maxSpendCents: 150000,
    stepUpThresholdCents: 100000
  });

  const tamperedToken = {
    ...token,
    buyerId: "sme_malicious_attacker"
  };

  const isValid = verifySharedPaymentToken(tamperedToken);
  assert.equal(isValid, false);
});

test("Gauntlet Vector 12: rejects ACP token when spend limit is inflated", () => {
  const token = createSharedPaymentToken({
    buyerId: "sme_austin_01",
    sku: "organic-flour-50lb",
    maxSpendCents: 150000,
    stepUpThresholdCents: 100000
  });

  const tamperedToken = {
    ...token,
    maxAuthorizedCents: 9999999
  };

  const isValid = verifySharedPaymentToken(tamperedToken);
  assert.equal(isValid, false);
});

test("Gauntlet Vector 13: rejects expired ACP Shared Payment Token", () => {
  const expiredToken = createSharedPaymentToken({
    buyerId: "sme_austin_01",
    sku: "organic-flour-50lb",
    maxSpendCents: 150000,
    stepUpThresholdCents: 100000
  }, undefined, -30000);

  const isValid = verifySharedPaymentToken(expiredToken);
  assert.equal(isValid, false);
});


test("Gauntlet Vector 14: blocks illegal coalition finite state machine skipping", () => {
  assert.equal(canTransition("FORMING", "SETTLED"), false);
  assert.equal(canTransition("FORMING", "FULFILLING"), false);
  assert.equal(canTransition("LOCKED", "FORMING"), false);

  assert.throws(
    () => transitionCoalitionState({ status: "FORMING" }, "SETTLED"),
    /Illegal state transition/
  );
});

test("Gauntlet Vector 15: enforces exact financial and unit conservation", () => {
  const unbalancedProposal = {
    coalitionId: "coalition_flour_01",
    sku: "organic-flour-50lb",
    totalUnits: 500,
    unitPriceCents: 720,
    discountPct: 28,
    intent: "AUTHORIZE",
    idempotencyKey: "nonce_secure_1234",
    allocations: [
      { buyerId: "sme_austin_01", units: 250, amountCents: 180000, stepUpRequired: true },
      { buyerId: "sme_bean_02", units: 200, amountCents: 144000, stepUpRequired: false }
    ]
  };

  const result = interceptNegotiationProposal(unbalancedProposal, mockContext);
  assert.equal(result.valid, false);
  assert.ok(result.violations.some(v => v.includes("does not equal total coalition units")));
  assert.ok(result.violations.some(v => v.includes("does not balance total expected cents")));
});
