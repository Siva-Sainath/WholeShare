import test from "node:test";
import assert from "node:assert/strict";
import {
  INCOTERMS_2020,
  GLOBAL_LOGISTICS_CORRIDORS,
  convertCurrencyToCents,
  calculateFxRiskBuffer,
  CrossBorderEscrowEngine,
  matchLogisticsCorridor
} from "../src/lib/international-trade.js";
import { BusinessInductionEngine } from "../src/lib/business-induction.js";

test("INCOTERMS_2020 registers standard trade terms with release triggers", () => {
  assert.equal(INCOTERMS_2020.FOB.code, "FOB");
  assert.equal(INCOTERMS_2020.FOB.escrowReleaseTrigger, "BILL_OF_LADING_ISSUED");
  assert.equal(INCOTERMS_2020.CIF.freightPayer, "SELLER");
  assert.equal(INCOTERMS_2020.DDP.customsImportPayer, "SELLER");
  assert.equal(INCOTERMS_2020.EXW.freightPayer, "BUYER");
});

test("GLOBAL_LOGISTICS_CORRIDORS covers multi-continent trade routes", () => {
  assert.ok(GLOBAL_LOGISTICS_CORRIDORS.length >= 6);
  const transpacific = GLOBAL_LOGISTICS_CORRIDORS.find(c => c.id === "CORRIDOR_PEARL_RIVER_TO_LONG_BEACH");
  assert.ok(transpacific);
  assert.equal(transpacific.originRegion, "APAC");
  assert.equal(transpacific.destinationRegion, "NORTH_AMERICA");

  const suez = GLOBAL_LOGISTICS_CORRIDORS.find(c => c.id === "CORRIDOR_SOUTH_ASIA_TO_ROTTERDAM");
  assert.ok(suez);
  assert.equal(suez.modalType, "MARITIME_FCL");

  const coldchain = GLOBAL_LOGISTICS_CORRIDORS.find(c => c.id === "CORRIDOR_NAIVASHA_TO_SCHIPHOL_AIR");
  assert.ok(coldchain);
  assert.equal(coldchain.modalType, "AIR_EXPRESS_COLDCHAIN");
});

test("convertCurrencyToCents converts multi-currency amounts using integer basis points", () => {
  const eurToUsd = convertCurrencyToCents(10000, "EUR", "USD");
  assert.equal(eurToUsd, 10850);

  const usdToEur = convertCurrencyToCents(10850, "USD", "EUR");
  assert.equal(usdToEur, 10000);

  const sameUsd = convertCurrencyToCents(5000, "USD", "USD");
  assert.equal(sameUsd, 5000);

  assert.throws(() => {
    convertCurrencyToCents(10.5, "USD", "EUR");
  }, /integer/);

  assert.throws(() => {
    convertCurrencyToCents(100, "INVALID_XYZ", "USD");
  }, /Unsupported/);
});

test("calculateFxRiskBuffer computes integer basis points buffer", () => {
  const buffer200Bps = calculateFxRiskBuffer(100000, 200);
  assert.equal(buffer200Bps, 2000);

  const buffer300Bps = calculateFxRiskBuffer(500000, 300);
  assert.equal(buffer300Bps, 15000);

  assert.throws(() => {
    calculateFxRiskBuffer(100.5, 200);
  }, /integer/);
});

test("CrossBorderEscrowEngine manages multi-milestone contract lifecycle", () => {
  const engine = new CrossBorderEscrowEngine();

  const contract = engine.createContract({
    contractId: "cb_escrow_101",
    buyerId: "buyer_munich_gmbh",
    sellerId: "seller_shenzhen_electronics",
    amountCents: 1000000,
    currency: "USD",
    incoterm: "FOB",
    corridorId: "CORRIDOR_PEARL_RIVER_TO_LONG_BEACH",
    fxBufferBps: 200
  });

  assert.equal(contract.state, "DRAFT");
  assert.equal(contract.amountCents, 1000000);
  assert.equal(contract.fxBufferCents, 20000);
  assert.equal(contract.totalAuthorizedCents, 1020000);

  engine.transitionState("cb_escrow_101", "SOFT_LOCKED");
  assert.equal(contract.state, "SOFT_LOCKED");

  engine.transitionState("cb_escrow_101", "EXPORT_CUSTOMS_CLEARED", {
    customsDocId: "CN_CUSTOMS_EXP_9921",
    checkpoint: "CHINA_CUSTOMS_EXPORT_DECLARATION"
  });
  assert.equal(contract.state, "EXPORT_CUSTOMS_CLEARED");
  assert.equal(contract.customsDeclarations.length, 1);

  engine.transitionState("cb_escrow_101", "CARRIER_ONBOARD_BL", {
    carrier: "MAERSK_LINE",
    trackingNumber: "MAEU881920391"
  });
  assert.equal(contract.state, "CARRIER_ONBOARD_BL");
  assert.equal(contract.carrierTracking.trackingNumber, "MAEU881920391");

  engine.transitionState("cb_escrow_101", "IMPORT_CUSTOMS_CLEARED", {
    customsDocId: "US_CBP_7501_99182",
    checkpoint: "US_CUSTOMS_ENTRY"
  });
  assert.equal(contract.state, "IMPORT_CUSTOMS_CLEARED");

  engine.transitionState("cb_escrow_101", "DESTINATION_ACCEPTED");
  assert.equal(contract.state, "DESTINATION_ACCEPTED");

  const settlement = engine.calculateSettlement("cb_escrow_101");
  assert.equal(settlement.sellerPayoutCents, 1000000);
  assert.equal(settlement.buyerRefundBufferCents, 20000);
  assert.equal(settlement.totalAuthorizedCents, 1020000);

  engine.transitionState("cb_escrow_101", "SETTLED");
  assert.equal(contract.state, "SETTLED");

  assert.throws(() => {
    engine.transitionState("cb_escrow_101", "SOFT_LOCKED");
  }, /Illegal state transition/);
});

test("BusinessInductionEngine induces cross-cultural global trade archetypes", () => {
  const engine = new BusinessInductionEngine();

  const apacProfile = engine.induceProfile("buyer_shenzhen_smt", [
    { description: "Multi-layer PCB bare board 4-layer FR4", quantity: 500, unitPriceCents: 450 },
    { description: "Surface mount resistor reels 0603 10k", quantity: 20, unitPriceCents: 1200 },
    { description: "Lead-free solder paste SAC305 jar", quantity: 10, unitPriceCents: 4500 }
  ], { isCrossBorder: true });
  assert.equal(apacProfile.archetypeId, "APAC_ELECTRONICS_HARDWARE");
  assert.equal(apacProfile.internationalTrade.isCrossBorder, true);
  assert.equal(apacProfile.internationalTrade.defaultIncoterm, "FOB");

  const textileProfile = engine.induceProfile("buyer_tiruppur_knitwear", [
    { description: "Combed cotton yarn 30s count hosiery", quantity: 100, unitPriceCents: 3200 },
    { description: "Reactive dye reactive blue 21 bulk", quantity: 15, unitPriceCents: 5400 },
    { description: "Spun polyester sewing thread cones", quantity: 40, unitPriceCents: 850 }
  ]);
  assert.equal(textileProfile.archetypeId, "SOUTH_ASIA_TEXTILES_GARMENTS");
  assert.equal(textileProfile.internationalTrade.defaultIncoterm, "CIF");

  const latamProfile = engine.induceProfile("buyer_medellin_coop", [
    { description: "Specialty green coffee Arabica parchment", quantity: 60, unitPriceCents: 28000 },
    { description: "GrainPro hermetic liner bag 60kg", quantity: 60, unitPriceCents: 650 },
    { description: "Jute bags 60kg export grade", quantity: 60, unitPriceCents: 420 }
  ]);
  assert.equal(latamProfile.archetypeId, "LATAM_SPECIALTY_AGRO_COMMODITY");
  assert.equal(latamProfile.internationalTrade.corridorId, "CORRIDOR_MEDELLIN_TO_HAMBURG");

  const coldChainProfile = engine.induceProfile("buyer_naivasha_floriculture", [
    { description: "Fresh cut flowers premium red roses", quantity: 200, unitPriceCents: 1800 },
    { description: "Perforated flower sleeves export carton", quantity: 50, unitPriceCents: 450 },
    { description: "Temperature datalogger USB cold-chain", quantity: 20, unitPriceCents: 1200 }
  ]);
  assert.equal(coldChainProfile.archetypeId, "AFRICAN_AGRO_COLD_CHAIN");
  assert.equal(coldChainProfile.internationalTrade.corridorId, "CORRIDOR_NAIVASHA_TO_SCHIPHOL_AIR");
});
