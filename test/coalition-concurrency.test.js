import test, { describe, it } from "node:test";
import assert from "node:assert/strict";
import { actionDispatcher } from "../src/lib/web-actions.js";

describe("Coalition Concurrency & Race Condition Prevention Tests", () => {
  it("processes concurrent pledges without lost updates and triggers THRESHOLD_MET exactly once", async () => {
    actionDispatcher.resetState();

    const coalitionId = "coalition_flour_01";
    const initialCoalition = actionDispatcher.coalitions.get(coalitionId);
    assert.ok(initialCoalition, "Initial flour coalition must exist");
    assert.equal(initialCoalition.status, "FORMING");
    assert.equal(initialCoalition.currentUnits, 300);
    assert.equal(initialCoalition.targetUnits, 500);

    let thresholdMetEventCount = 0;
    const testListener = (event) => {
      if (event.type === "COALITION_THRESHOLD_MET" && event.payload.coalitionId === coalitionId) {
        thresholdMetEventCount++;
      }
    };
    actionDispatcher.listeners.add(testListener);

    // Concurrently pledge from 4 different SME buyers at the exact same millisecond
    // 300 + 50 + 60 + 50 + 70 = 530 units (crosses 500 target)
    const concurrentPledges = [
      actionDispatcher.joinCoalition({
        smeId: "sme_concurrent_01",
        sku: "organic-flour-50lb",
        units: 50,
        coalitionId
      }),
      actionDispatcher.joinCoalition({
        smeId: "sme_concurrent_02",
        sku: "organic-flour-50lb",
        units: 60,
        coalitionId
      }),
      actionDispatcher.joinCoalition({
        smeId: "sme_concurrent_03",
        sku: "organic-flour-50lb",
        units: 50,
        coalitionId
      }),
      actionDispatcher.joinCoalition({
        smeId: "sme_concurrent_04",
        sku: "organic-flour-50lb",
        units: 70,
        coalitionId
      })
    ];

    await Promise.all(concurrentPledges);

    actionDispatcher.listeners.delete(testListener);

    const finalCoalition = actionDispatcher.coalitions.get(coalitionId);
    assert.equal(finalCoalition.status, "THRESHOLD_MET", "Status must be THRESHOLD_MET");
    assert.equal(finalCoalition.currentUnits, 530, "Current units must equal exact sum with zero lost updates");
    assert.equal(thresholdMetEventCount, 1, "COALITION_THRESHOLD_MET must fire exactly once under concurrent pledges");
  });
});

