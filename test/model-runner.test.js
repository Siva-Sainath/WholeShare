import test from "node:test";
import assert from "node:assert/strict";
import { computeDeterministicAllocation, proposeCoalitionAllocation } from "../src/lib/model-runner.js";

const discountTiers = [
  { minUnits: 500, discountPct: 10 },
  { minUnits: 1000, discountPct: 15 },
  { minUnits: 1500, discountPct: 20 }
];

const buyers = [
  { buyerId: "sme_austin_bakery", requestedUnits: 450, maxSpendCents: 500000, stepUpThresholdCents: 100000 },
  { buyerId: "sme_bean_roasters", requestedUnits: 500, maxSpendCents: 600000, stepUpThresholdCents: 200000 },
  { buyerId: "sme_green_cafe", requestedUnits: 350, maxSpendCents: 400000, stepUpThresholdCents: 150000 }
];

test("deterministic allocation calculates exact volume, tier discount, and integer cents", () => {
  const proposal = computeDeterministicAllocation(
    "coalition_test_01",
    "organic-flour-50lb",
    buyers,
    discountTiers,
    1200
  );

  assert.equal(proposal.totalUnits, 1300);
  assert.equal(proposal.discountPct, 15);
  assert.equal(proposal.unitPriceCents, 1020);
  assert.equal(proposal.intent, "AUTHORIZE");

  const sumUnits = proposal.allocations.reduce((acc, a) => acc + a.units, 0);
  assert.equal(sumUnits, 1300);

  const sumCents = proposal.allocations.reduce((acc, a) => acc + a.amountCents, 0);
  assert.equal(sumCents, 1300 * 1020);

  assert.equal(proposal.allocations[0].amountCents, 450 * 1020);
  assert.equal(proposal.allocations[0].stepUpRequired, true);
});

test("proposeCoalitionAllocation returns an interceptor-verified proposal", { timeout: 360000 }, async () => {
  const result = await proposeCoalitionAllocation(
    "coalition_test_02",
    "organic-flour-50lb",
    buyers,
    discountTiers,
    1200
  );

  assert.equal(result.evaluation.valid, true);
  assert.equal(result.evaluation.invariantsPassed.length, 10);
  assert.equal(result.proposal.totalUnits, 1300);
  assert.equal(result.proposal.intent, "AUTHORIZE");
  assert.ok(
    result.executionSource.includes("openrouter") ||
    result.executionSource.includes("mlx") ||
    result.executionSource.includes("nemotron") ||
    result.executionSource.includes("qwen")
  );
});
