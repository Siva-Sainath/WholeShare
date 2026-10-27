import test from "node:test";
import assert from "node:assert/strict";
import { businessInduction } from "../src/lib/business-induction.js";
import { generateInstinctProfileHeader } from "../src/lib/instinct-profile.js";
import { instinctFs } from "../src/lib/instinct-fs.js";

test("BusinessInductionEngine induces CNC machine shop from raw metal procurement items", () => {
  const buyerId = `test_cnc_${Date.now()}`;
  const rawItems = [
    { description: "6061-T6 Aluminum Bar Stock 2in x 72in", quantity: 20, unitPriceCents: 4500, totalCents: 90000, vendor: "Midwest Steel & Aluminum" },
    { description: "4-Flute Solid Carbide End Mill 0.5in", quantity: 10, unitPriceCents: 3200, totalCents: 32000, vendor: "Kennametal Tooling" },
    { description: "Synthetic Water-Soluble CNC Coolant 5-Gal Pail", quantity: 4, unitPriceCents: 8500, totalCents: 34000, vendor: "Blaser Swisslube" }
  ];

  const profile = businessInduction.induceProfile(buyerId, rawItems, { legalName: "Apex Precision CNC Machining" });

  assert.equal(profile.buyerId, buyerId);
  assert.equal(profile.industryDomain, "Precision Machining & Advanced Manufacturing");
  assert.ok(profile.confidence >= 0.80);
  assert.ok(profile.primaryOutputs.some(o => o.includes("machined metal")));

  const aluminumBom = profile.billOfMaterials.find(m => m.materialName.includes("Aluminum"));
  assert.ok(aluminumBom);
  assert.equal(aluminumBom.materialCategory, "RAW_MATERIAL");
  assert.equal(aluminumBom.poolingEligible, true);

  const endMillBom = profile.billOfMaterials.find(m => m.materialName.includes("End Mill"));
  assert.ok(endMillBom);
  assert.equal(endMillBom.materialCategory, "TOOLING");

  assert.ok(profile.boundaries.maxAutoAuthorizeCents > 0);
  assert.ok(profile.boundaries.stepUpThresholdCents >= profile.boundaries.maxAutoAuthorizeCents);

  const entity = instinctFs.readEntity(buyerId);
  assert.ok(entity);
  assert.equal(entity.frontmatter.tradeCategory, "Precision Machining & Advanced Manufacturing");

  const header = generateInstinctProfileHeader(buyerId);
  assert.ok(header.includes("Precision Machining & Advanced Manufacturing"));
  assert.ok(!header.includes("Commercial Bakery"));
});

test("BusinessInductionEngine induces Specialty Ceramic Studio from pottery materials", () => {
  const buyerId = `test_ceramics_${Date.now()}`;
  const rawItems = [
    { description: "Stoneware Moist Throwing Clay 50lb Box", quantity: 15, unitPriceCents: 2200, totalCents: 33000, vendor: "Laguna Clay Co" },
    { description: "Cobalt Blue Gloss Ceramic Glaze 1-Gal", quantity: 6, unitPriceCents: 4800, totalCents: 28800, vendor: "Amaco Glazes" },
    { description: "Cordierite Kiln Shelves 21in x 1in", quantity: 4, unitPriceCents: 7500, totalCents: 30000, vendor: "Skutt Kiln Accessories" }
  ];

  const profile = businessInduction.induceProfile(buyerId, rawItems, { legalName: "Mud & Fire Ceramic Arts" });

  assert.equal(profile.industryDomain, "Ceramic Arts & Specialty Pottery Production");
  assert.ok(profile.poolingOpportunities.some(p => p.includes("Clay") || p.includes("Glaze")));

  const header = generateInstinctProfileHeader(buyerId);
  assert.ok(header.includes("Ceramic Arts & Specialty Pottery Production"));
});

test("BusinessInductionEngine induces Vertical Hydroponic Farm from substrate and nutrients", () => {
  const buyerId = `test_hydro_${Date.now()}`;
  const rawItems = [
    { description: "Horticultural Rockwool Grow Cubes 1.5in Plugs Case", quantity: 12, unitPriceCents: 3800, totalCents: 45600, vendor: "Grodan Hydroponics" },
    { description: "Organic Liquid Nutrient Macro Concentrate 5-Gal", quantity: 6, unitPriceCents: 9200, totalCents: 55200, vendor: "Botanicare Nutrients" },
    { description: "Non-GMO Pea Shoot & Sunflower Microgreen Seeds 10lb", quantity: 8, unitPriceCents: 4200, totalCents: 33600, vendor: "Johnny's Selected Seeds" }
  ];

  const profile = businessInduction.induceProfile(buyerId, rawItems, { legalName: "Green Canopy Vertical Farms" });

  assert.equal(profile.industryDomain, "Controlled Environment Agriculture & Vertical Farming");
  assert.ok(profile.primaryOutputs.some(o => o.includes("microgreens")));
  assert.ok(profile.boundaries.stepUpThresholdUsd > 0);

  const header = generateInstinctProfileHeader(buyerId);
  assert.ok(header.includes("Controlled Environment Agriculture & Vertical Farming"));
});

test("BusinessInductionEngine synthesizes domain dynamically for novel unseen commercial goods", () => {
  const buyerId = `test_novel_${Date.now()}`;
  const rawItems = [
    { description: "Optical Grade Quartz Crystal Prisms 25mm", quantity: 10, unitPriceCents: 6500, totalCents: 65000, vendor: "Thorlabs Optics" },
    { description: "Custom Photonic Mirror Mountings", quantity: 10, unitPriceCents: 4000, totalCents: 40000, vendor: "Edmund Optics" }
  ];

  const profile = businessInduction.induceProfile(buyerId, rawItems, { legalName: "Spectra Laser Systems" });

  assert.ok(profile.industryDomain.includes("Commercial Operations"));
  assert.ok(profile.billOfMaterials.length >= 2);
  assert.ok(profile.boundaries.monthlySpendCents > 0);
});
