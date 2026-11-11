import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Shipments live in a private file, so this test never touches the story shipments.
process.env.WHOLESHARE_DELIVERY_FILE = join(mkdtempSync(join(tmpdir(), "delivery-")), "delivery-records.json");
process.env.WHOLESHARE_PLEDGES_FILE = join(mkdtempSync(join(tmpdir(), "pledges-")), "pledges.json");
const { recordPledge, findPledge, markDelivered, releasePayment, settleClaimPayment, listPledges, applyPledgesToLedger } = await import("../src/lib/pledge-ledger.js");
const { actionDispatcher } = await import("../src/lib/web-actions.js");
const { currentOwnerId } = await import("../src/lib/user-settings.js");
const { getDeliveryStorage } = await import("../src/storage/delivery.storage.ts");
const { getAllClans } = await import("../src/lib/matchmaking/clanStore.ts");

const clan = getAllClans().find((entry) => entry.settlementCurrency === "USD" && entry.status === "FORMING");
const owner = currentOwnerId();
const fakeCapture = async ({ authorizationId, amountCents }) => ({ captureId: `CAP-${authorizationId}-${amountCents}`, status: "COMPLETED" });
const fakeRefund = async ({ captureId, amountCents }) => ({ refundId: `REF-${captureId}-${amountCents}`, rawResponse: { id: "x" } });


test("a recorded pledge appears in the ledger with its authorization id", () => {
  recordPledge({ clanId: clan.id, units: 12, amountCents: 27456, orderId: "ORD1", authorizationId: "AUTH1", businessName: "Test Kitchen" });
  const coalition = [...actionDispatcher.coalitions.values()].find((entry) => entry.clanId === clan.id);
  const member = coalition.members.find((entry) => entry.smeId === owner);
  assert.equal(member.pledgedUnits, 12);
  assert.equal(member.authorizationId, "AUTH1");
  assert.equal(findPledge(clan.id)?.status, "AUTHORIZED");
});

test("applying the saved pledges again does not add the units twice", () => {
  applyPledgesToLedger();
  applyPledgesToLedger();
  const coalition = [...actionDispatcher.coalitions.values()].find((entry) => entry.clanId === clan.id);
  assert.equal(coalition.members.find((entry) => entry.smeId === owner).pledgedUnits, 12);
});

test("payment cannot be released before the goods are delivered", async () => {
  getDeliveryStorage().removeByMember(owner);
  const result = await releasePayment({ clanId: clan.id }, { capture: fakeCapture });
  assert.equal(result.released, false);
  assert.match(result.reason, /not been confirmed/);
});

test("accepting delivered goods captures the hold once", async () => {
  const record = markDelivered({ clanId: clan.id });
  assert.equal(record.status, "DELIVERED");
  assert.ok(Date.parse(record.inspectionWindowEndsAt) > Date.now());
  const first = await releasePayment({ clanId: clan.id }, { capture: fakeCapture });
  assert.equal(first.released, true);
  assert.equal(first.captureId, "CAP-AUTH1-27456");
  const again = await releasePayment({ clanId: clan.id }, { capture: async () => { throw new Error("must not capture twice"); } });
  assert.equal(again.alreadyReleased, true);
});

test("a settled claim on a captured payment refunds the damaged units", async () => {
  const result = await settleClaimPayment({ clanId: clan.id, memberId: owner, amountCents: 4000 }, { capture: fakeCapture, refund: fakeRefund });
  assert.equal(result.refundId, "REF-CAP-AUTH1-27456-4000");
  assert.equal(result.rawResponse.kind, "REFUND");
});

test("a settled claim on an open hold pays the supplier for the intact units only", async () => {
  recordPledge({ clanId: clan.id, units: 5, amountCents: 10000, orderId: "ORD2", authorizationId: "AUTH2", businessName: "Test Kitchen" });
  const result = await settleClaimPayment({ clanId: clan.id, memberId: owner, amountCents: 2500 }, { capture: fakeCapture, refund: fakeRefund });
  assert.equal(result.rawResponse.kind, "PARTIAL_CAPTURE");
  assert.equal(result.rawResponse.capturedCents, 7500);
  assert.equal(result.rawResponse.releasedCents, 2500);
});

test("without a PayPal hold the settlement says it is a local record", async () => {
  const result = await settleClaimPayment({ clanId: "clan-without-pledge", memberId: owner, amountCents: 1000 }, { capture: fakeCapture, refund: fakeRefund });
  assert.equal(result.refundId, "LOCAL-RECORD");
  assert.match(result.rawResponse.note, /local record/);
  assert.equal(listPledges().length >= 1, true);
});
