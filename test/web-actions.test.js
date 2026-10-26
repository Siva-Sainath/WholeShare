import test from "node:test";
import assert from "node:assert/strict";
import { actionDispatcher } from "../src/lib/web-actions.js";

test("actionDispatcher initializes with seeded SME personas and active coalition", () => {
  actionDispatcher.resetState();
  const ledger = actionDispatcher.getLedgerState();
  assert.ok(ledger.length >= 1);
  assert.equal(ledger[0].coalitionId, "coalition_flour_01");
  assert.equal(ledger[0].status, "FORMING");
});

test("spawnSme creates a verified SME with ACP shared payment token", () => {
  const result = actionDispatcher.spawnSme({
    id: "sme_artisan_flour",
    name: "Artisan Flour House",
    maxAutoAuthorizeUsd: 2500,
    stepUpThresholdUsd: 1500,
    sku: "organic-flour-50lb",
    pledgedUnits: 200
  });

  assert.equal(result.sme.id, "sme_artisan_flour");
  assert.equal(result.sme.maxAutoAuthorizeCents, 250000);
  assert.ok(result.token.tokenId.startsWith("spt_"));

  const ledger = actionDispatcher.getLedgerState();
  const flourCoalition = ledger.find(c => c.coalitionId === "coalition_flour_01");
  assert.ok(flourCoalition.currentUnits >= 500);
});

test("runNegotiation computes volume discount and asserts interceptor", async () => {
  const result = await actionDispatcher.runNegotiation("coalition_flour_01");
  assert.ok(result.proposal.totalUnits >= 500);
  assert.equal(result.evaluation.valid, true);
  assert.equal(result.evaluation.invariantsPassed.length, 10);
});

test("authorizeEscrow locks member authorizations and transitions to LOCKED", () => {
  const coalition = actionDispatcher.authorizeEscrow("coalition_flour_01");
  assert.equal(coalition.status, "LOCKED");
  assert.ok(coalition.members.every(m => m.status === "AUTHORIZED"));
  assert.ok(coalition.members.every(m => Boolean(m.paypalOrderId)));
});
