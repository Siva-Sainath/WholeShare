import test from "node:test";
import assert from "node:assert/strict";
import { canTransition, transitionCoalitionState } from "../src/lib/fsm.js";

const initialCoalition = {
  id: "coalition_flour_101",
  sku: "organic-flour-50lb",
  skuName: "Organic Flour 50lb",
  targetUnits: 1000,
  currentUnits: 450,
  unitPriceCents: 1200,
  discountTierPct: 0,
  status: "FORMING"
};

test("canTransition validates valid next states", () => {
  assert.equal(canTransition("FORMING", "THRESHOLD_MET"), true);
  assert.equal(canTransition("FORMING", "LOCKED"), false);
  assert.equal(canTransition("THRESHOLD_MET", "AWAITING_STEP_UP"), true);
  assert.equal(canTransition("THRESHOLD_MET", "LOCKED"), true);
  assert.equal(canTransition("LOCKED", "FULFILLING"), true);
  assert.equal(canTransition("FULFILLING", "SETTLED"), true);
  assert.equal(canTransition("SETTLED", "FORMING"), false);
});

test("transitionCoalitionState advances status and records audit event", () => {
  const result = transitionCoalitionState(initialCoalition, "THRESHOLD_MET", {
    unitsPledged: 1300
  });

  assert.equal(result.coalition.status, "THRESHOLD_MET");
  assert.equal(result.auditEvent.fromStatus, "FORMING");
  assert.equal(result.auditEvent.toStatus, "THRESHOLD_MET");
  assert.equal(result.auditEvent.coalitionId, initialCoalition.id);
});

test("transitionCoalitionState throws on illegal transition", () => {
  assert.throws(() => {
    transitionCoalitionState(initialCoalition, "SETTLED");
  }, /Illegal state transition from FORMING to SETTLED/);
});
