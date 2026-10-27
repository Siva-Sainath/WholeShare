import test from "node:test";
import assert from "node:assert/strict";
import {
  COMMERCIAL_ARCHETYPES,
  GENERALIZED_COMMERCIAL_FALLBACK,
  findMatchingArchetype,
  classifyMaterialCategory,
  isPoolingCandidate
} from "../src/lib/commercial-archetypes.js";
import { businessInduction } from "../src/lib/business-induction.js";

test("findMatchingArchetype identifies Discrete Manufacturing", () => {
  const items = [
    "6061-T6 Aluminum Billet 4x4x12",
    "Carbide 4-flute End Mill 1/2in",
    "Water Soluble Synthetic Coolant 5-Gal Pail"
  ];
  const res = findMatchingArchetype(items);
  assert.equal(res.archetype.id, "DISCRETE_MANUFACTURING");
  assert.ok(res.score >= 3);
  assert.ok(res.matchedKeywords.includes("aluminum"));
  assert.ok(res.matchedKeywords.includes("end mill"));
});

test("findMatchingArchetype identifies Process & Batch Production", () => {
  const items = [
    "Organic Hard Red Winter Wheat Flour 50lb",
    "Granulated Pure Cane Sugar 50lb",
    "Active Dry Yeast 1lb Vacuum Brick"
  ];
  const res = findMatchingArchetype(items);
  assert.equal(res.archetype.id, "PROCESS_BATCH_PRODUCTION");
  assert.ok(res.score >= 3);
  assert.ok(res.matchedKeywords.includes("flour"));
  assert.ok(res.matchedKeywords.includes("sugar"));
});

test("findMatchingArchetype identifies Controlled Environment Agriculture", () => {
  const items = [
    "Horticultural Rockwool Substrate Grow Slabs",
    "Liquid Hydroponic Mineral Nutrient Concentrate",
    "Non-GMO Basil and Microgreen Seeds"
  ];
  const res = findMatchingArchetype(items);
  assert.equal(res.archetype.id, "CONTROLLED_ENVIRONMENT_AGRICULTURE");
  assert.ok(res.score >= 3);
  assert.ok(res.matchedKeywords.includes("rockwool"));
  assert.ok(res.matchedKeywords.includes("nutrient"));
});

test("findMatchingArchetype identifies Automotive & Equipment MRO", () => {
  const items = [
    "Semi-Metallic Front Brake Pads Set",
    "Slotted and Drilled Brake Rotor Pair",
    "Synthetic 5W-30 Motor Oil 55-Gal Drum",
    "R-410A Refrigerant Cylinder 25lb"
  ];
  const res = findMatchingArchetype(items);
  assert.equal(res.archetype.id, "SERVICE_REPAIR_MRO");
  assert.ok(res.score >= 4);
  assert.ok(res.matchedKeywords.includes("brake"));
  assert.ok(res.matchedKeywords.includes("motor oil"));
});

test("findMatchingArchetype identifies Hospitality & Restaurant Food Service", () => {
  const items = [
    "USDA Choice Prime Sirloin Steaks Case",
    "Pure Canola Deep Frying Oil 35lb Jug",
    "Hinged Take-out Clamshell Containers 500ct",
    "Heavyweight Beverage Napkins 1000ct"
  ];
  const res = findMatchingArchetype(items);
  assert.equal(res.archetype.id, "HOSPITALITY_FOOD_SERVICE");
  assert.ok(res.score >= 3);
  assert.ok(res.matchedKeywords.includes("sirloin"));
  assert.ok(res.matchedKeywords.includes("napkin"));
});

test("findMatchingArchetype identifies Retail & E-Commerce Fulfillment", () => {
  const items = [
    "Self-Seal Poly Bubble Mailers #2 250ct",
    "Corrugated Shipping Boxes 12x12x6 50ct",
    "Direct Thermal Shipping Labels 4x6 Roll",
    "Reinforced Water-Activated Paper Tape Case"
  ];
  const res = findMatchingArchetype(items);
  assert.equal(res.archetype.id, "RETAIL_DISTRIBUTION_FULFILLMENT");
  assert.ok(res.score >= 4);
  assert.ok(res.matchedKeywords.includes("mailer"));
  assert.ok(res.matchedKeywords.includes("shipping label"));
});

test("findMatchingArchetype identifies Ceramic Arts & Pottery Craft", () => {
  const items = [
    "Stoneware Moist Throwing Clay 50lb Box",
    "Gloss Finish Ceramic Glaze 1-Gal",
    "Pyrometric Orton Cones Box",
    "Cordierite Kiln Shelves 21in Round"
  ];
  const res = findMatchingArchetype(items);
  assert.equal(res.archetype.id, "ARTISAN_SPECIALTY_CRAFT");
  assert.ok(res.score >= 4);
  assert.ok(res.matchedKeywords.includes("clay"));
  assert.ok(res.matchedKeywords.includes("glaze"));
  assert.ok(res.matchedKeywords.includes("kiln"));
});

test("findMatchingArchetype falls back to Generalized Commercial for novel goods", () => {
  const items = [
    "Cryogenic Superconducting Niobium Cavity",
    "Ultra-High Vacuum Flange Seal 4.5in",
    "Liquid Helium Transfer Syphon"
  ];
  const res = findMatchingArchetype(items);
  assert.equal(res.archetype.id, "GENERALIZED_COMMERCIAL_OPERATIONS");
  assert.equal(res.score, 0);
});

test("classifyMaterialCategory partitions inputs into 5 canonical BOM buckets", () => {
  const archetype = COMMERCIAL_ARCHETYPES.find(a => a.id === "DISCRETE_MANUFACTURING");

  assert.equal(classifyMaterialCategory("6061 Aluminum Round Bar", archetype), "RAW_MATERIAL");
  assert.equal(classifyMaterialCategory("Carbide Reamer 0.25in", archetype), "TOOLING");
  assert.equal(classifyMaterialCategory("Synthetic Soluble Coolant", archetype), "CONSUMABLE");
  assert.equal(classifyMaterialCategory("Antistatic Shipping Crate", archetype), "PACKAGING");
  assert.equal(classifyMaterialCategory("Spindle Drive Belt Replacement", archetype), "MRO");
});

test("isPoolingCandidate flags standardized commodities for coalition aggregation", () => {
  const discrete = COMMERCIAL_ARCHETYPES.find(a => a.id === "DISCRETE_MANUFACTURING");
  const bakery = COMMERCIAL_ARCHETYPES.find(a => a.id === "PROCESS_BATCH_PRODUCTION");

  assert.equal(isPoolingCandidate("Aluminum 6061 Bar Stock", discrete), true);
  assert.equal(isPoolingCandidate("Cutting Coolant 5-Gal Pail", discrete), true);
  assert.equal(isPoolingCandidate("Organic Artisan Flour 50lb", bakery), true);
  assert.equal(isPoolingCandidate("Granulated White Sugar 50lb", bakery), true);
  assert.equal(isPoolingCandidate("Proprietary Laser Microchip SKU-99", discrete), false);
});

test("BusinessInductionEngine induces full profile across all 7 archetypes", () => {
  const testScenarios = [
    {
      name: "Apex Machining",
      items: [{ description: "Aluminum Bar Stock", quantity: 10, unitPriceCents: 5000 }],
      expectedArchetype: "DISCRETE_MANUFACTURING"
    },
    {
      name: "Golden Crust Bakeshop",
      items: [{ description: "Organic Bakers Flour 50lb", quantity: 20, unitPriceCents: 3000 }],
      expectedArchetype: "PROCESS_BATCH_PRODUCTION"
    },
    {
      name: "Aero Greens Lab",
      items: [{ description: "Rockwool Substrate Plugs", quantity: 15, unitPriceCents: 2500 }],
      expectedArchetype: "CONTROLLED_ENVIRONMENT_AGRICULTURE"
    },
    {
      name: "Metro Fleet Auto Repair",
      items: [{ description: "Motor Oil 55-Gal Drum", quantity: 2, unitPriceCents: 45000 }],
      expectedArchetype: "SERVICE_REPAIR_MRO"
    },
    {
      name: "Bistro 44 Dining",
      items: [{ description: "USDA Sirloin Steaks", quantity: 25, unitPriceCents: 3500 }],
      expectedArchetype: "HOSPITALITY_FOOD_SERVICE"
    },
    {
      name: "Boxed Express 3PL",
      items: [{ description: "Poly Mailer Shipping Bags", quantity: 100, unitPriceCents: 40 }],
      expectedArchetype: "RETAIL_DISTRIBUTION_FULFILLMENT"
    },
    {
      name: "Earth & Fire Pottery",
      items: [{ description: "Stoneware Clay 50lb", quantity: 10, unitPriceCents: 2200 }],
      expectedArchetype: "ARTISAN_SPECIALTY_CRAFT"
    }
  ];

  for (const s of testScenarios) {
    const buyerId = `test_arch_${s.name.toLowerCase().replace(/[^a-z0-9]/g, "_")}`;
    const profile = businessInduction.induceProfile(buyerId, s.items, { legalName: s.name });

    assert.equal(profile.archetypeId, s.expectedArchetype);
    assert.ok(profile.confidence >= 0.60);
    assert.ok(profile.billOfMaterials.length > 0);
    assert.ok(profile.boundaries.maxAutoAuthorizeCents > 0);
    assert.ok(profile.boundaries.stepUpThresholdCents >= profile.boundaries.maxAutoAuthorizeCents);
    assert.ok(profile.boundaries.maxAutoAuthorizeCents <= 500000);
  }
});
