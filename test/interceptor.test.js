import test from "node:test";
import assert from "node:assert/strict";
import { interceptNegotiationProposal } from "../src/lib/interceptor.js";

const mockContext = {
  catalogPriceCents: 1200,
  mandates: new Map([
    ["sme_austin_bakery", { maxSpendCents: 500000, stepUpThresholdCents: 100000 }],
    ["sme_bean_roasters", { maxSpendCents: 600000, stepUpThresholdCents: 200000 }],
    ["sme_green_cafe", { maxSpendCents: 400000, stepUpThresholdCents: 150000 }]
  ])
};

const validProposal = {
  coalitionId: "coalition_flour_101",
  sku: "organic-flour-50lb",
  totalUnits: 1300,
  unitPriceCents: 1020,
  discountPct: 15,
  intent: "AUTHORIZE",
  idempotencyKey: "nonce_abc12345",
  allocations: [
    { buyerId: "sme_austin_bakery", units: 450, amountCents: 459000, stepUpRequired: true },
    { buyerId: "sme_bean_roasters", units: 500, amountCents: 510000, stepUpRequired: true },
    { buyerId: "sme_green_cafe", units: 350, amountCents: 357000, stepUpRequired: true }
  ]
};

test("passes valid proposal satisfying all 10 invariants", () => {
  const result = interceptNegotiationProposal(validProposal, mockContext);
  assert.equal(result.valid, true);
  assert.equal(result.invariantsPassed.length, 10);
  assert.equal(result.violations.length, 0);
});

test("rejects floating point amounts in proposal", () => {
  const badProposal = {
    ...validProposal,
    unitPriceCents: 10.20
  };
  const result = interceptNegotiationProposal(badProposal, mockContext);
  assert.equal(result.valid, false);
  assert.ok(result.violations.some(v => v.includes("positive integers")));
});

test("rejects direct CAPTURE intent during coalition formation", () => {
  const badProposal = {
    ...validProposal,
    intent: "CAPTURE"
  };
  const result = interceptNegotiationProposal(badProposal, mockContext);
  assert.equal(result.valid, false);
  assert.ok(result.violations.some(v => v.includes("strictly be 'AUTHORIZE'")));
});

test("rejects unit price exceeding catalog price", () => {
  const badProposal = {
    ...validProposal,
    unitPriceCents: 1500
  };
  const result = interceptNegotiationProposal(badProposal, mockContext);
  assert.equal(result.valid, false);
  assert.ok(result.violations.some(v => v.includes("exceeds catalog price")));
});

test("rejects volume allocation mismatch", () => {
  const badProposal = {
    ...validProposal,
    allocations: [
      { buyerId: "sme_austin_bakery", units: 400, amountCents: 408000, stepUpRequired: true },
      { buyerId: "sme_bean_roasters", units: 500, amountCents: 510000, stepUpRequired: true },
      { buyerId: "sme_green_cafe", units: 350, amountCents: 357000, stepUpRequired: true }
    ]
  };
  const result = interceptNegotiationProposal(badProposal, mockContext);
  assert.equal(result.valid, false);
  assert.ok(result.violations.some(v => v.includes("does not equal total coalition units")));
});

test("rejects financial arithmetic mismatch", () => {
  const badProposal = {
    ...validProposal,
    allocations: [
      { buyerId: "sme_austin_bakery", units: 450, amountCents: 459000, stepUpRequired: true },
      { buyerId: "sme_bean_roasters", units: 500, amountCents: 510000, stepUpRequired: true },
      { buyerId: "sme_green_cafe", units: 350, amountCents: 300000, stepUpRequired: true }
    ]
  };
  const result = interceptNegotiationProposal(badProposal, mockContext);
  assert.equal(result.valid, false);
  assert.ok(result.violations.some(v => v.includes("does not balance total expected cents")));
});

test("rejects duplicate buyer allocations in single coalition", () => {
  const badProposal = {
    ...validProposal,
    allocations: [
      { buyerId: "sme_austin_bakery", units: 450, amountCents: 459000, stepUpRequired: true },
      { buyerId: "sme_austin_bakery", units: 500, amountCents: 510000, stepUpRequired: true },
      { buyerId: "sme_green_cafe", units: 350, amountCents: 357000, stepUpRequired: true }
    ]
  };
  const result = interceptNegotiationProposal(badProposal, mockContext);
  assert.equal(result.valid, false);
  assert.ok(result.violations.some(v => v.includes("Duplicate buyer allocations")));
});

test("rejects allocation exceeding buyer spend cap", () => {
  const badProposal = {
    ...validProposal,
    allocations: [
      { buyerId: "sme_austin_bakery", units: 450, amountCents: 600000, stepUpRequired: true },
      { buyerId: "sme_bean_roasters", units: 500, amountCents: 369000, stepUpRequired: true },
      { buyerId: "sme_green_cafe", units: 350, amountCents: 357000, stepUpRequired: true }
    ]
  };
  const result = interceptNegotiationProposal(badProposal, mockContext);
  assert.equal(result.valid, false);
  assert.ok(result.violations.some(v => v.includes("exceeds mandate cap")));
});
