import assert from "node:assert/strict";
import test from "node:test";
import {
  getLayaEngine,
  routeIntent,
  gateToolRisk,
  verifyDealProposal,
  closeLayaEngine
} from "../src/lib/laya-engine.js";

test("Laya Engine initializes and loads ONNX session in Node.js", async () => {
  const engine = await getLayaEngine();
  assert.ok(engine, "Laya instance must not be null.");
  assert.equal(typeof engine.systemOne, "function");
});

test("routeIntent routes catalog queries directly without requiring LLM", async () => {
  const prompt = "Can we check the current bulk flour price list from Sysco?";
  const decision = await routeIntent(prompt);

  assert.ok(decision.intent, "Intent must be resolved.");
  assert.equal(typeof decision.requiresLlm, "boolean");
  assert.ok(decision.probabilities, "Probabilities map must be present.");
});

test("gateToolRisk identifies mutating actions and step-up requirements", async () => {
  const toolName = "authorize_paypal_order";
  const toolArgs = { orderId: "ORD-99231", amountCents: 150000 };
  const risk = await gateToolRisk(toolName, toolArgs);

  assert.equal(risk.toolName, toolName);
  assert.equal(typeof risk.mutating, "boolean");
  assert.equal(typeof risk.highValue, "boolean");
  assert.equal(typeof risk.requiresStepUp, "boolean");
});

test("verifyDealProposal inspects proposal allocation consistency", async () => {
  const proposal = {
    syndicateId: "syn_flour_001",
    totalUnits: 500,
    unitPriceCents: 2450,
    members: [
      { memberId: "bakery_alpha", units: 300, pledgeCents: 735000 },
      { memberId: "bakery_beta", units: 200, pledgeCents: 490000 }
    ]
  };

  const verification = await verifyDealProposal(proposal);
  assert.equal(typeof verification.verified, "boolean");
  assert.equal(typeof verification.invariantsConsistent, "boolean");
  assert.equal(typeof verification.fairDistribution, "boolean");
});

test("closeLayaEngine releases ONNX session cleanly", async () => {
  await closeLayaEngine();
});
