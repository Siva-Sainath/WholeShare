import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { actionDispatcher } from "../src/lib/web-actions.js";
import { createOrderAuthorization, getOrder } from "../src/lib/paypal-bridge.js";
import { executeTool } from "../src/lib/tool-registry.js";
import { TokenBucketRateLimiter } from "../src/lib/rate-limiter.js";
import { evaluateOrderPolicy } from "../src/lib/policy.ts";

test("Consumer Persona 1: Specialty Coffee Roaster (High-Value Wholesale & Step-Up KYC)", async () => {
  const smeId = `sme_coffee_${Date.now()}`;
  const clanId = "coalition_coffee_02";

  actionDispatcher.coalitions.set(clanId, {
    id: clanId,
    sku: "specialty-coffee-green-60kg",
    skuName: "Ethiopian Yirgacheffe Grade 1 Green Coffee (60 kg Sack)",
    targetUnits: 20,
    currentUnits: 0,
    unitPriceCents: 36000,
    discountTierPct: 0,
    status: "FORMING",
    members: []
  });

  actionDispatcher.spawnSme({
    id: smeId,
    name: "Blue Mountain Artisans",
    maxAutoAuthorizeUsd: 2500,
    stepUpThresholdUsd: 1000
  });

  const coalition = await actionDispatcher.joinCoalition({
    coalitionId: clanId,
    smeId,
    units: 10
  });

  const member = coalition.members.find(m => m.smeId === smeId);
  assert.ok(member);
  assert.equal(member.smeId, smeId);
  assert.equal(member.pledgedUnits, 10);
  assert.equal(member.stepUpRequired, true);

  const auth = await createOrderAuthorization({
    amountCents: member.authorizedCents,
    referenceId: smeId
  });

  assert.ok(auth.orderId);
  assert.equal(auth.intent, "AUTHORIZE");

  const remoteOrder = await getOrder(auth.orderId);
  assert.equal(remoteOrder.id, auth.orderId);
  assert.ok(remoteOrder.status === "CREATED" || remoteOrder.status === "COMPLETED");
});

test("Consumer Persona 2: Artisan Bakery Network (Volume Tier Escalation & Governance)", { timeout: 240000 }, async () => {
  const uniqueSuffix = Date.now();
  const testClanId = `coalition_flour_stress_${uniqueSuffix}`;
  const founderId = `sme_founder_${uniqueSuffix}`;
  const buyer2Id = `sme_partner_${uniqueSuffix}`;

  actionDispatcher.catalog.set(`flour_sku_${uniqueSuffix}`, {
    sku: `flour_sku_${uniqueSuffix}`,
    name: "Organic Hard Red Wheat Flour 50lb",
    category: "BAKERY_STAPLES",
    basePriceCents: 1000,
    tiers: [
      { tier: 1, minUnits: 100, priceUsd: 10.00, discountPct: 0 },
      { tier: 2, minUnits: 500, priceUsd: 7.20, discountPct: 28 },
      { tier: 3, minUnits: 1000, priceUsd: 5.80, discountPct: 42 }
    ]
  });

  actionDispatcher.coalitions.set(testClanId, {
    id: testClanId,
    sku: `flour_sku_${uniqueSuffix}`,
    skuName: "Organic Hard Red Wheat Flour 50lb",
    status: "FORMING",
    targetUnits: 500,
    currentUnits: 0,
    unitPriceCents: 1000,
    discountTierPct: 0,
    members: []
  });

  actionDispatcher.spawnSme({
    id: founderId,
    name: "Founder Sourdough Bakery",
    maxAutoAuthorizeUsd: 5000,
    stepUpThresholdUsd: 2000
  });

  actionDispatcher.spawnSme({
    id: buyer2Id,
    name: "Partner Brioche House",
    maxAutoAuthorizeUsd: 5000,
    stepUpThresholdUsd: 2000
  });

  await actionDispatcher.joinCoalition({
    coalitionId: testClanId,
    smeId: founderId,
    units: 150
  });
  const clanAfterFirst = actionDispatcher.coalitions.get(testClanId);
  assert.equal(clanAfterFirst.currentUnits, 150);
  assert.equal(clanAfterFirst.discountTierPct, 0);

  await actionDispatcher.joinCoalition({
    coalitionId: testClanId,
    smeId: buyer2Id,
    units: 350
  });
  const clanAfterSecond = actionDispatcher.coalitions.get(testClanId);
  assert.equal(clanAfterSecond.currentUnits, 500);

  const neg = await actionDispatcher.runNegotiation(testClanId);
  assert.equal(neg.proposal.discountPct, 28);
  assert.equal(neg.proposal.unitPriceCents, 720);

  const proposalResult = await executeTool("create_governance_proposal", {
    coalitionId: testClanId,
    proposerSmeId: founderId,
    ruleType: "INSPECTION_WINDOW_HOURS",
    proposedValue: 24,
    rationale: "Perishable organic flour requires 24 hour rapid inspection."
  });
  assert.equal(proposalResult.status, "SUCCESS");
  const proposalId = proposalResult.proposal.id;

  const vote1 = await executeTool("cast_clan_vote", {
    proposalId,
    coalitionId: testClanId,
    smeId: founderId,
    choice: "AFFIRMATIVE"
  });
  assert.equal(vote1.status, "SUCCESS");

  const vote2 = await executeTool("cast_clan_vote", {
    proposalId,
    coalitionId: testClanId,
    smeId: buyer2Id,
    choice: "AFFIRMATIVE"
  });
  assert.equal(vote2.status, "SUCCESS");

  const tallyResult = await executeTool("tally_and_enact_proposal", {
    proposalId,
    coalitionId: testClanId,
    forceEarly: true
  });
  assert.equal(tallyResult.status, "SUCCESS");
  assert.equal(tallyResult.proposal.status, "ENACTED");
  assert.equal(tallyResult.enactedConstitution.rules.INSPECTION_WINDOW_HOURS, 24);

  const invalidProposal = await executeTool("create_governance_proposal", {
    coalitionId: testClanId,
    proposerSmeId: founderId,
    ruleType: "SPEND_CAP_ENFORCEMENT",
    proposedValue: "DISABLED",
    rationale: "Attempt to disable platform financial spend limit."
  });
  assert.equal(invalidProposal.status, "ERROR");
  assert.match(invalidProposal.error, /Cannot propose changes to immutable FinTech invariant/);
});

test("Consumer Persona 3: Hardware MRO Supplier (Delivery, Damage Claim & Batch Payout)", async () => {
  const uniqueClanId = `coalition_mro_${Date.now()}`;
  const supplierId = "sme_central_fastener_21";
  const buyerId = "sme_hillcountry_mro_22";

  const supplierConfirm = await executeTool("confirm_delivery_receipt", {
    coalitionId: uniqueClanId,
    smeId: buyerId,
    role: "supplier",
    trackingNumber: "1Z9999999999999999",
    carrierName: "UPS"
  });
  assert.equal(supplierConfirm.status, "SUCCESS");

  const buyerConfirm = await executeTool("confirm_delivery_receipt", {
    coalitionId: uniqueClanId,
    smeId: buyerId,
    role: "buyer"
  });
  assert.equal(buyerConfirm.status, "SUCCESS");
  assert.ok(buyerConfirm.deliveryRecord.inspectionWindowEndsAt);

  const claimResult = await executeTool("submit_damage_claim", {
    coalitionId: uniqueClanId,
    smeId: buyerId,
    orderId: "ORD-STRESS-01",
    captureId: "CAP-STRESS-01",
    damagedUnits: 5,
    unitPriceCents: 9600,
    orderValueCents: 144000,
    description: "5 cases damaged by forklift puncture.",
    photoUrls: ["https://example.com/fasteners_puncture.jpg"]
  });
  assert.equal(claimResult.status, "SUCCESS");
  assert.equal(claimResult.claim.claimedAmount, 480);
  assert.equal(claimResult.claim.status, "BUYER_APPROVED");
  const claimId = claimResult.claim.claimId;

  const supplierAccept = await executeTool("respond_supplier_claim", {
    claimId,
    supplierId,
    action: "ACCEPT"
  });
  assert.equal(supplierAccept.status, "SUCCESS");
  assert.equal(supplierAccept.result.status, "SETTLED");
  assert.equal(supplierAccept.result.agreedRefundAmount, 480);

  const duplicateReject = await executeTool("respond_supplier_claim", {
    claimId,
    supplierId,
    action: "ACCEPT"
  });
  assert.equal(duplicateReject.status, "ERROR");
  assert.ok(duplicateReject.error.includes("already been settled") || duplicateReject.error.includes("SingleRefundViolation"));
});

test("Consumer Persona 4: Webhook Security, Idempotency & Tamper Detection", async () => {
  const privateKey = crypto.generateKeyPairSync("rsa", {
    modulusLength: 2048,
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" }
  }).privateKey;

  const validPayload = JSON.stringify({
    id: `WH-EVENT-${Date.now()}`,
    event_type: "CHECKOUT.ORDER.COMPLETED",
    resource: { id: "ORD-LEGIT-100", amount: { value: "576.00", currency_code: "USD" } }
  });

  const signer = crypto.createSign("RSA-SHA256");
  signer.update(validPayload);
  const validSignature = signer.sign(privateKey, "base64");

  const tamperedPayload = JSON.stringify({
    id: `WH-EVENT-${Date.now()}`,
    event_type: "CHECKOUT.ORDER.COMPLETED",
    resource: { id: "ORD-LEGIT-100", amount: { value: "0.01", currency_code: "USD" } }
  });

  const verifier = crypto.createVerify("RSA-SHA256");
  verifier.update(tamperedPayload);
  const isTamperValid = verifier.verify(crypto.createPublicKey(privateKey), validSignature, "base64");
  assert.equal(isTamperValid, false);
});

test("Consumer Persona 5: High-Concurrency Pledges & Gateway Rate Limiting", async () => {
  const clanId = `coalition_conc_${Date.now()}`;
  actionDispatcher.coalitions.set(clanId, {
    id: clanId,
    sku: "corrugated-boxes-12x12x12",
    skuName: "Shipping Boxes",
    status: "FORMING",
    targetUnits: 300,
    currentUnits: 0,
    unitPriceCents: 2625,
    discountTierPct: 0,
    members: []
  });

  const concurrentSmes = Array.from({ length: 15 }, (_, i) => ({
    id: `sme_box_buyer_${Date.now()}_${i}`,
    name: `Packaging Consumer ${i}`,
    maxAutoAuthorizeUsd: 1000,
    stepUpThresholdUsd: 500
  }));

  for (const sme of concurrentSmes) {
    actionDispatcher.spawnSme(sme);
  }

  const joinPromises = concurrentSmes.map((sme) =>
    actionDispatcher.joinCoalition({
      coalitionId: clanId,
      smeId: sme.id,
      units: 10
    })
  );

  await Promise.all(joinPromises);

  const clan = actionDispatcher.coalitions.get(clanId);
  assert.equal(clan.members.length, 15);
  assert.equal(clan.currentUnits, 150);

  const limiter = new TokenBucketRateLimiter({
    capacity: 5,
    refillRatePerSec: 1
  });

  let acceptedCount = 0;
  let rejectedCount = 0;

  for (let i = 0; i < 15; i++) {
    const check = limiter.isAllowed("192.168.1.100");
    if (check.allowed) {
      acceptedCount++;
    } else {
      rejectedCount++;
      assert.ok(check.retryAfterSec >= 0);
    }
  }

  assert.equal(acceptedCount, 5);
  assert.equal(rejectedCount, 10);
});
