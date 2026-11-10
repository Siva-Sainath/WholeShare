import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadGazetteer } from "../src/lib/geo/gazetteer.ts";

const cities = loadGazetteer();

const B2B_PRODUCTS = [
  // Food & Beverage Specialty
  {
    sku: "Artisan Sicilian Pistachio Paste 100% Pure",
    vertical: "PROCESS_BATCH_PRODUCTION",
    hsCode: "2008.19",
    baseCents: 4500, // $45.00 / kg
    currency: "EUR",
    unitName: "kg",
    moq: 1000,
    tiers: [{ minUnits: 250, discountPct: 15 }, { minUnits: 500, discountPct: 25 }, { minUnits: 1000, discountPct: 35 }],
    supplier: "Bronte Pistacchio Consorzio D.O.P.",
    supplierTrust: 0.992,
    leadDays: 7
  },
  {
    sku: "Specialty Grade 1 Ethiopian Yirgacheffe Green Coffee Beans",
    vertical: "PROCESS_BATCH_PRODUCTION",
    hsCode: "0901.11",
    baseCents: 950, // $9.50 / kg
    currency: "USD",
    unitName: "kg",
    moq: 2000,
    tiers: [{ minUnits: 500, discountPct: 12 }, { minUnits: 1000, discountPct: 22 }, { minUnits: 2000, discountPct: 32 }],
    supplier: "Oromia Specialty Coffee Export Syndicate",
    supplierTrust: 0.985,
    leadDays: 14
  },
  {
    sku: "Organic Stone-Ground Hard Red Winter Wheat Flour",
    vertical: "PROCESS_BATCH_PRODUCTION",
    hsCode: "1101.00",
    baseCents: 120, // $1.20 / lb
    currency: "USD",
    unitName: "lb",
    moq: 5000,
    tiers: [{ minUnits: 1000, discountPct: 10 }, { minUnits: 2500, discountPct: 18 }, { minUnits: 5000, discountPct: 28 }],
    supplier: "Heartland Heritage Grain Millers Co-op",
    supplierTrust: 0.978,
    leadDays: 5
  },
  {
    sku: "Cold-Pressed Extra Virgin Spanish Arbequina Olive Oil",
    vertical: "PROCESS_BATCH_PRODUCTION",
    hsCode: "1509.20",
    baseCents: 1250, // $12.50 / L
    currency: "EUR",
    unitName: "L",
    moq: 1500,
    tiers: [{ minUnits: 300, discountPct: 12 }, { minUnits: 750, discountPct: 20 }, { minUnits: 1500, discountPct: 30 }],
    supplier: "OleoAndaluz Export Cooperativa",
    supplierTrust: 0.988,
    leadDays: 8
  },
  {
    sku: "Madagascar Bourbon Pure Vanilla Extract 2-Fold",
    vertical: "PROCESS_BATCH_PRODUCTION",
    hsCode: "3302.10",
    baseCents: 18500, // $185.00 / gal
    currency: "USD",
    unitName: "gal",
    moq: 100,
    tiers: [{ minUnits: 20, discountPct: 10 }, { minUnits: 50, discountPct: 18 }, { minUnits: 100, discountPct: 28 }],
    supplier: "Sava Agri-Flavors International",
    supplierTrust: 0.990,
    leadDays: 12
  },

  // Discrete Manufacturing & Tooling
  {
    sku: "Solid Carbide 4-Flute TiAlN Coated End Mill Set 1/2in",
    vertical: "DISCRETE_MANUFACTURING",
    hsCode: "8207.70",
    baseCents: 6800, // $68.00 / unit
    currency: "EUR",
    unitName: "unit",
    moq: 300,
    tiers: [{ minUnits: 50, discountPct: 15 }, { minUnits: 150, discountPct: 24 }, { minUnits: 300, discountPct: 35 }],
    supplier: "Guhring Precision Tools Werkzeuge",
    supplierTrust: 0.995,
    leadDays: 6
  },
  {
    sku: "Aerospace Grade 5 Titanium Fastener Bolts DIN 933 M8",
    vertical: "DISCRETE_MANUFACTURING",
    hsCode: "8108.90",
    baseCents: 1450, // $14.50 / bolt
    currency: "USD",
    unitName: "unit",
    moq: 2000,
    tiers: [{ minUnits: 400, discountPct: 12 }, { minUnits: 1000, discountPct: 22 }, { minUnits: 2000, discountPct: 32 }],
    supplier: "Kobe Steel Precision Fastener Division",
    supplierTrust: 0.996,
    leadDays: 10
  },
  {
    sku: "Precision ER32 Collet Chuck Set Ultra Precision DIN 6499",
    vertical: "DISCRETE_MANUFACTURING",
    hsCode: "8466.10",
    baseCents: 24000, // $240.00 / set
    currency: "JPY",
    unitName: "set",
    moq: 150,
    tiers: [{ minUnits: 30, discountPct: 10 }, { minUnits: 75, discountPct: 20 }, { minUnits: 150, discountPct: 30 }],
    supplier: "NT Tool Corporation Kansai",
    supplierTrust: 0.994,
    leadDays: 7
  },
  {
    sku: "6061-T6 Extruded Aluminum Billet Bar Stock 50mm",
    vertical: "DISCRETE_MANUFACTURING",
    hsCode: "7604.29",
    baseCents: 420, // $4.20 / kg
    currency: "USD",
    unitName: "kg",
    moq: 4000,
    tiers: [{ minUnits: 800, discountPct: 10 }, { minUnits: 2000, discountPct: 18 }, { minUnits: 4000, discountPct: 26 }],
    supplier: "Alcoa Extrusions Logistics Hub",
    supplierTrust: 0.982,
    leadDays: 9
  },

  // Packaging & Industrial
  {
    sku: "Recycled Corrugated Shipping Box 200lb Test 16x12x12",
    vertical: "PACKAGING_MATERIALS",
    hsCode: "4819.10",
    baseCents: 115, // $1.15 / box
    currency: "USD",
    unitName: "box",
    moq: 8000,
    tiers: [{ minUnits: 1500, discountPct: 14 }, { minUnits: 4000, discountPct: 22 }, { minUnits: 8000, discountPct: 34 }],
    supplier: "Smurfit Westrock Packaging Group",
    supplierTrust: 0.989,
    leadDays: 4
  },
  {
    sku: "Biodegradable PLA Thermal Shrink Film Roll 45 Micron",
    vertical: "PACKAGING_MATERIALS",
    hsCode: "3920.69",
    baseCents: 650, // $6.50 / kg
    currency: "EUR",
    unitName: "kg",
    moq: 2000,
    tiers: [{ minUnits: 400, discountPct: 12 }, { minUnits: 1000, discountPct: 20 }, { minUnits: 2000, discountPct: 30 }],
    supplier: "BioPackaging Europa B.V.",
    supplierTrust: 0.984,
    leadDays: 6
  },

  // CleanTech & Solar
  {
    sku: "Bifacial Monocrystalline Solar Photovoltaic Module 550W",
    vertical: "CLEANTECH_ENERGY",
    hsCode: "8541.43",
    baseCents: 11000, // $110.00 / panel
    currency: "USD",
    unitName: "panel",
    moq: 500,
    tiers: [{ minUnits: 100, discountPct: 15 }, { minUnits: 250, discountPct: 24 }, { minUnits: 500, discountPct: 36 }],
    supplier: "Trina Heliotech Solar Alliance",
    supplierTrust: 0.991,
    leadDays: 14
  },
  {
    sku: "Commercial Geothermal Heat Pump Hydronic Heat Exchanger",
    vertical: "CLEANTECH_ENERGY",
    hsCode: "8418.61",
    baseCents: 385000, // $3850.00 / unit
    currency: "USD",
    unitName: "unit",
    moq: 20,
    tiers: [{ minUnits: 4, discountPct: 10 }, { minUnits: 10, discountPct: 18 }, { minUnits: 20, discountPct: 28 }],
    supplier: "Danfoss Commercial Climate Solutions",
    supplierTrust: 0.993,
    leadDays: 18
  },

  // Textiles & Specialty Fibers
  {
    sku: "Combed Long-Staple Organic Cotton Ring-Spun Yarn 30s/1",
    vertical: "TEXTILES_APPAREL",
    hsCode: "5205.23",
    baseCents: 380, // $3.80 / kg
    currency: "USD",
    unitName: "kg",
    moq: 3000,
    tiers: [{ minUnits: 600, discountPct: 10 }, { minUnits: 1500, discountPct: 18 }, { minUnits: 3000, discountPct: 28 }],
    supplier: "Coimbatore Textile Spinners Guild",
    supplierTrust: 0.987,
    leadDays: 12
  },
  {
    sku: "Raw Japanese Selvedge Indigo Denim Fabric 14oz",
    vertical: "TEXTILES_APPAREL",
    hsCode: "5209.42",
    baseCents: 1650, // $16.50 / meter
    currency: "JPY",
    unitName: "meter",
    moq: 1000,
    tiers: [{ minUnits: 200, discountPct: 12 }, { minUnits: 500, discountPct: 22 }, { minUnits: 1000, discountPct: 32 }],
    supplier: "Kojima Kurashiki Mills Corporation",
    supplierTrust: 0.995,
    leadDays: 8
  }
];

// Pick 60 major commercial hubs for pre-seeded clans
const majorCities = cities.slice(0, 65);

const seededClans = [];
let clanCounter = 1;

for (const city of majorCities) {
  // Seed 8-10 clans per city across various products
  for (let i = 0; i < B2B_PRODUCTS.length; i++) {
    const prod = B2B_PRODUCTS[i];

    // Calculate realistic current units: between 50% and 92% of MOQ to create compelling velocity!
    const fillPercent = 0.50 + ((clanCounter * 13) % 43) / 100; // 50% to 92%
    const currentUnits = Math.round(prod.moq * fillPercent);
    const memberCount = Math.max(2, Math.floor(currentUnits / (prod.moq / 6)));

    // Currency matches city if possible, or product currency
    const clanCurrency = city.paypalCurrency || prod.currency;

    // City prefix
    const citySlug = city.city.toLowerCase().replace(/[^a-z0-9]/g, "");
    const prodSlug = prod.sku.split(" ").slice(0, 2).join("-").toLowerCase().replace(/[^a-z0-9-]/g, "");
    const clanId = `clan-${citySlug}-${prodSlug}-${String(clanCounter).padStart(3, "0")}`;

    const clan = {
      id: clanId,
      name: `${city.city} ${prod.sku.split(" ").slice(0, 3).join(" ")} Purchasing Syndicate`,
      industryVertical: prod.vertical,
      canonicalSku: prod.sku,
      hsCodePrefix: prod.hsCode,
      city: city.city,
      countryCode: city.countryCode,
      settlementCurrency: clanCurrency,
      targetUnits: prod.moq,
      currentUnits,
      baseUnitPriceCents: prod.baseCents,
      discountTiers: prod.tiers,
      estimatedDeliveryDays: prod.leadDays,
      supplierId: `supp-${String((clanCounter % 15) + 1).padStart(3, "0")}`,
      supplierName: prod.supplier,
      supplierTrustScore: prod.supplierTrust,
      corridorId: city.majorPortOrHub,
      lat: city.lat,
      lng: city.lng,
      memberCount,
      status: currentUnits >= prod.moq ? "MOQ_REACHED" : "FORMING",
      isCrossBorder: false,
      createdAt: new Date(Date.now() - (clanCounter * 86400000) % (30 * 86400000)).toISOString()
    };

    seededClans.push(clan);
    clanCounter++;
  }
}

console.log(`Generated ${seededClans.length} pre-seeded clans across ${majorCities.length} major cities.`);
const outputPath = resolve(process.cwd(), "data/seeded-clans.json");
writeFileSync(outputPath, JSON.stringify(seededClans, null, 2), "utf-8");
console.log(`Successfully written to ${outputPath}`);

