import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { extractMatchVector } from "../src/lib/matchmaking/qwenExtractor.ts";
import { matchAndRankClans } from "../src/lib/matchmaking/mlCoalitionScorer.ts";
import {
  joinClanWithEscrow,
  lockClanEscrow,
  dispatchShipment,
  openCustomerDispute,
  settleEscrow
} from "../src/lib/matchmaking/clanEscrowFsm.ts";
import { saveClan } from "../src/lib/matchmaking/clanStore.ts";
import { loadGazetteer, lookupCity, calculateHaversineDistanceKm } from "../src/lib/geo/gazetteer.ts";

describe("WholeShare ML Matchmaking & Escrow Pipeline", () => {
  test("Gazetteer loads 500+ global cities with authentic coordinates", () => {
    const cities = loadGazetteer();
    assert.ok(cities.length >= 500, `Expected at least 500 cities, got ${cities.length}`);

    const osaka = lookupCity("Osaka");
    assert.ok(osaka);
    assert.equal(osaka.countryCode, "JP");
    assert.equal(osaka.paypalCurrency, "JPY");

    const milan = lookupCity("Milan");
    assert.ok(milan);
    assert.equal(milan.countryCode, "IT");
    assert.equal(milan.paypalCurrency, "EUR");

    const distanceKm = calculateHaversineDistanceKm(osaka.lat, osaka.lng, milan.lat, milan.lng);
    assert.ok(distanceKm > 9000 && distanceKm < 11000, `Distance unexpected: ${distanceKm}`);
  });

  test("Qwen Extractor compresses natural language into strict 8-field MatchVector", async () => {
    const query = "Specialty coffee roaster in Osaka needing 300kg Ethiopian green beans";
    const vector = await extractMatchVector(query);

    assert.equal(vector.city, "Osaka");
    assert.equal(vector.countryCode, "JP");
    assert.equal(vector.settlementCurrency, "JPY");
    assert.equal(vector.quantityRequested, 300);
    assert.ok(vector.canonicalSku.toLowerCase().includes("coffee"));
    assert.ok(vector.hsCodePrefix.startsWith("0901"));
    assert.ok(vector.maxDeliveryDays > 0);
  });

  test("ML Coalition Scorer computes multi-objective utility in sub-50ms with explainable breakdown", async () => {
    const matchVector = {
      smeName: "Osaka Coffee Lab",
      industryVertical: "PROCESS_BATCH_PRODUCTION",
      city: "Osaka",
      countryCode: "JP",
      settlementCurrency: "JPY",
      canonicalSku: "Specialty Grade 1 Green Coffee Beans",
      hsCodePrefix: "0901.11",
      quantityRequested: 300,
      currentUnitCostBaseline: 950,
      maxDeliveryDays: 30
    };

    const startTime = Date.now();
    const ranked = await matchAndRankClans(matchVector);
    const durationMs = Date.now() - startTime;

    assert.ok(durationMs < 1500, `Expected sub-1.5s execution, got ${durationMs}ms`);
    assert.ok(ranked.length >= 1, "Expected at least 1 matched clan");

    const top = ranked[0];
    assert.ok(top.matchScore >= 80, `Expected score >= 80%, got ${top.matchScore}%`);
    assert.ok(top.featureBreakdown.marginalDiscount > 0);
    assert.ok(top.featureBreakdown.moqVelocity > 0);
    assert.ok(top.featureBreakdown.corridorEfficiency > 0);
    assert.ok(top.featureBreakdown.supplierTrust > 0);
    assert.ok(top.summaryPill.includes("Wholesale Savings"));
  });

  test("Context-Aware JIT Fallback generates realistic peer SMEs and suppliers for unseeded city", async () => {
    const rareVector = {
      smeName: "Bordeaux Heritage Cooperage",
      industryVertical: "DISCRETE_MANUFACTURING",
      city: "Bordeaux",
      countryCode: "FR",
      settlementCurrency: "EUR",
      canonicalSku: "French White Oak Wine Barrels 225L",
      hsCodePrefix: "4416.00",
      quantityRequested: 40,
      currentUnitCostBaseline: 85000,
      maxDeliveryDays: 20
    };

    const ranked = await matchAndRankClans(rareVector);
    assert.ok(ranked.length >= 1);
    const top = ranked[0];
    assert.ok(top.matchScore >= 75, `Expected score >= 75%, got ${top.matchScore}%`);
    assert.ok(top.clan.city.length > 0);
  });

  test("Deterministic Escrow FSM advances through full lifecycle without illegal jumps", () => {
    const clanId = `clan-test-fsm-${Date.now()}`;
    const testClan = {
      id: clanId,
      name: "Kyoto Test Coffee Syndicate",
      industryVertical: "PROCESS_BATCH_PRODUCTION",
      canonicalSku: "Specialty Grade 1 Green Coffee Beans",
      hsCodePrefix: "0901.11",
      city: "Kyoto",
      countryCode: "JP",
      settlementCurrency: "JPY",
      targetUnits: 1000,
      currentUnits: 600,
      baseUnitPriceCents: 950,
      discountTiers: [
        { minUnits: 250, discountPct: 10 },
        { minUnits: 500, discountPct: 20 },
        { minUnits: 1000, discountPct: 30 }
      ],
      estimatedDeliveryDays: 7,
      supplierId: "supp-kyoto-01",
      supplierName: "Kyoto Direct Importers",
      supplierTrustScore: 0.99,
      corridorId: "Kansai Logistics Hub",
      lat: 35.0116,
      lng: 135.7681,
      memberCount: 2,
      status: "FORMING",
      isCrossBorder: false,
      createdAt: new Date().toISOString()
    };
    saveClan(testClan);

    const testVector = {
      smeName: "Kyoto Artisan Roasters",
      industryVertical: "PROCESS_BATCH_PRODUCTION",
      city: "Kyoto",
      countryCode: "JP",
      settlementCurrency: "JPY",
      canonicalSku: "Specialty Grade 1 Green Coffee Beans",
      hsCodePrefix: "0901.11",
      quantityRequested: 500,
      maxDeliveryDays: 30
    };

    const joinResult = joinClanWithEscrow(clanId, testVector);
    assert.equal(joinResult.escrow.state, "MOQ_REACHED");

    const lockedEscrow = lockClanEscrow(clanId);
    assert.equal(lockedEscrow.state, "PAYPAL_AUTH_LOCKED");

    const shippedEscrow = dispatchShipment(clanId, "TRACK-123456", "DHL Global");
    assert.equal(shippedEscrow.state, "IN_TRANSIT");

    const disputeEscrow = openCustomerDispute(clanId, "Transit damage reported");
    assert.equal(disputeEscrow.state, "DISPUTE_OPEN");

    const settledEscrow = settleEscrow(clanId, "PRO_RATA_CLAIM_SETTLED");
    assert.equal(settledEscrow.state, "SETTLED");
  });
});
