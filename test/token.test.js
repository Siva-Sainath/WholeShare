import test from "node:test";
import assert from "node:assert/strict";
import { createSharedPaymentToken, verifySharedPaymentToken } from "../src/lib/token.js";

test("creates and verifies a valid ACP shared payment token", () => {
  const mandate = {
    buyerId: "sme_austin_bakery",
    sku: "organic-flour-50lb",
    maxSpendCents: 45000,
    stepUpThresholdCents: 100000,
    nonce: "nonce_12345678"
  };

  const token = createSharedPaymentToken(mandate);
  assert.equal(token.buyerId, mandate.buyerId);
  assert.equal(token.sku, mandate.sku);
  assert.equal(token.maxAuthorizedCents, mandate.maxSpendCents);
  assert.equal(typeof token.hmacSignature, "string");
  assert.equal(token.hmacSignature.length, 64);

  const isValid = verifySharedPaymentToken(token);
  assert.equal(isValid, true);
});

test("rejects a token with tampered spend cap", () => {
  const mandate = {
    buyerId: "sme_austin_bakery",
    sku: "organic-flour-50lb",
    maxSpendCents: 45000,
    stepUpThresholdCents: 100000,
    nonce: "nonce_12345678"
  };

  const token = createSharedPaymentToken(mandate);
  const tampered = { ...token, maxAuthorizedCents: 999999 };
  const isValid = verifySharedPaymentToken(tampered);
  assert.equal(isValid, false);
});

test("rejects a token with tampered buyer identity", () => {
  const mandate = {
    buyerId: "sme_austin_bakery",
    sku: "organic-flour-50lb",
    maxSpendCents: 45000,
    stepUpThresholdCents: 100000,
    nonce: "nonce_12345678"
  };

  const token = createSharedPaymentToken(mandate);
  const tampered = { ...token, buyerId: "sme_hostile_attacker" };
  const isValid = verifySharedPaymentToken(tampered);
  assert.equal(isValid, false);
});

test("rejects an expired token", () => {
  const mandate = {
    buyerId: "sme_austin_bakery",
    sku: "organic-flour-50lb",
    maxSpendCents: 45000,
    stepUpThresholdCents: 100000,
    nonce: "nonce_12345678"
  };

  const token = createSharedPaymentToken(mandate, undefined, -1000);
  const isValid = verifySharedPaymentToken(token);
  assert.equal(isValid, false);
});
