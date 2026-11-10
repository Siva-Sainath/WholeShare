import { writeFileSync, readFileSync } from "node:fs";

// Deterministic simulated supplier database and extra product pool.
// Everything here is labelled simulated. It exists so demos can show fasteners, electronics, tools and Indian
// export goods next to the original catalog. Supplier names, sites and contacts are invented and use .example domains.

function hash(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
function rng(seed) {
  let state = seed || 1;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}
const slug = (text) => text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const pick = (random, list) => list[Math.floor(random() * list.length)];

// Hubs and what they are known for. Verticals match the catalog.
const HUBS = [
  { country: "India", code: "IN", city: "Ludhiana", verticals: ["DISCRETE_MANUFACTURING"], style: "Forge", certs: ["ISO 9001", "BIS", "IATF 16949"] },
  { country: "India", code: "IN", city: "Pune", verticals: ["DISCRETE_MANUFACTURING", "CLEANTECH_ENERGY"], style: "Precision", certs: ["ISO 9001", "IATF 16949", "ISO 14001"] },
  { country: "India", code: "IN", city: "Bengaluru", verticals: ["ELECTRICAL"], style: "Electronics", certs: ["ISO 9001", "RoHS", "BIS", "UL"] },
  { country: "India", code: "IN", city: "Chennai", verticals: ["ELECTRICAL", "DISCRETE_MANUFACTURING"], style: "Electro", certs: ["ISO 9001", "RoHS", "CE"] },
  { country: "India", code: "IN", city: "Surat", verticals: ["TEXTILES_APPAREL"], style: "Textiles", certs: ["OEKO-TEX", "GOTS", "ISO 9001"] },
  { country: "India", code: "IN", city: "Coimbatore", verticals: ["TEXTILES_APPAREL", "DISCRETE_MANUFACTURING"], style: "Mills", certs: ["GOTS", "OEKO-TEX"] },
  { country: "India", code: "IN", city: "Kochi", verticals: ["FOOD_AND_BEVERAGE", "PROCESS_BATCH_PRODUCTION"], style: "Spice", certs: ["FSSAI", "HACCP", "ISO 22000", "Organic India"] },
  { country: "India", code: "IN", city: "Kolkata", verticals: ["FOOD_AND_BEVERAGE", "PACKAGING_MATERIALS"], style: "Estates", certs: ["FSSAI", "Rainforest Alliance", "HACCP"] },
  { country: "India", code: "IN", city: "Mumbai", verticals: ["FOOD_AND_BEVERAGE", "MEDICAL_SUPPLIES", "PROCESS_BATCH_PRODUCTION"], style: "Traders", certs: ["FSSAI", "ISO 13485", "GMP"] },
  { country: "India", code: "IN", city: "Ahmedabad", verticals: ["PROCESS_BATCH_PRODUCTION", "PACKAGING_MATERIALS"], style: "Chemicals", certs: ["ISO 9001", "REACH", "ISO 14001"] },
  { country: "India", code: "IN", city: "Jaipur", verticals: ["CONSTRUCTION", "TEXTILES_APPAREL"], style: "Stone", certs: ["ISO 9001"] },
  { country: "India", code: "IN", city: "Delhi", verticals: ["ELECTRICAL", "JANITORIAL"], style: "Industries", certs: ["ISO 9001", "BIS"] },
  { country: "China", code: "CN", city: "Shenzhen", verticals: ["ELECTRICAL"], style: "Tech", certs: ["ISO 9001", "RoHS", "CE", "FCC", "UL"] },
  { country: "China", code: "CN", city: "Dongguan", verticals: ["ELECTRICAL", "DISCRETE_MANUFACTURING"], style: "Precision", certs: ["ISO 9001", "RoHS", "IATF 16949"] },
  { country: "China", code: "CN", city: "Ningbo", verticals: ["DISCRETE_MANUFACTURING", "PACKAGING_MATERIALS"], style: "Fasteners", certs: ["ISO 9001", "ISO 14001", "IATF 16949"] },
  { country: "Vietnam", code: "VN", city: "Ho Chi Minh City", verticals: ["TEXTILES_APPAREL", "FOOD_AND_BEVERAGE"], style: "Export", certs: ["WRAP", "GlobalGAP", "ISO 9001"] },
  { country: "Taiwan", code: "TW", city: "Taichung", verticals: ["DISCRETE_MANUFACTURING", "ELECTRICAL"], style: "Machinery", certs: ["ISO 9001", "CE", "RoHS"] },
  { country: "Germany", code: "DE", city: "Stuttgart", verticals: ["DISCRETE_MANUFACTURING", "CLEANTECH_ENERGY"], style: "Werke", certs: ["ISO 9001", "ISO 14001", "TUV"] },
  { country: "Germany", code: "DE", city: "Nuremberg", verticals: ["ELECTRICAL", "RESTAURANT_EQUIPMENT"], style: "Technik", certs: ["ISO 9001", "CE", "VDE"] },
  { country: "Italy", code: "IT", city: "Brescia", verticals: ["DISCRETE_MANUFACTURING", "RESTAURANT_EQUIPMENT"], style: "Meccanica", certs: ["ISO 9001", "CE"] },
  { country: "Turkey", code: "TR", city: "Bursa", verticals: ["TEXTILES_APPAREL", "CONSTRUCTION"], style: "Tekstil", certs: ["OEKO-TEX", "ISO 9001"] },
  { country: "Mexico", code: "MX", city: "Monterrey", verticals: ["DISCRETE_MANUFACTURING", "PACKAGING_MATERIALS", "CONSTRUCTION"], style: "Industrial", certs: ["ISO 9001", "IATF 16949"] },
  { country: "United States", code: "US", city: "Houston", verticals: ["CONSTRUCTION", "CLEANTECH_ENERGY", "DISCRETE_MANUFACTURING"], style: "Supply", certs: ["ISO 9001", "API", "UL"] },
  { country: "United States", code: "US", city: "Chicago", verticals: ["JANITORIAL", "PACKAGING_MATERIALS", "RESTAURANT_EQUIPMENT"], style: "Distribution", certs: ["ISO 9001", "NSF"] },
  { country: "United States", code: "US", city: "Austin", verticals: ["FOOD_AND_BEVERAGE", "ELECTRICAL"], style: "Wholesale", certs: ["SQF", "UL"] },
  { country: "Japan", code: "JP", city: "Osaka", verticals: ["DISCRETE_MANUFACTURING", "ELECTRICAL"], style: "Seiki", certs: ["ISO 9001", "JIS"] },
  { country: "South Korea", code: "KR", city: "Incheon", verticals: ["ELECTRICAL", "CLEANTECH_ENERGY"], style: "Systems", certs: ["ISO 9001", "KC", "RoHS"] },
  { country: "Thailand", code: "TH", city: "Rayong", verticals: ["PACKAGING_MATERIALS", "PROCESS_BATCH_PRODUCTION"], style: "Packaging", certs: ["ISO 9001", "BRC"] }
];

const NAME_PREFIX = {
  IN: ["Shree", "Bharat", "Sri Lakshmi", "Maruti", "Anand", "Kaveri", "Ganga", "Tirupati", "Rajesh", "Navjot", "Hindustan", "Sai", "Om Sai", "Patel", "Mahalaxmi", "Aryan", "Venkatesh"],
  CN: ["Shenhua", "Golden Bridge", "Jiangnan", "Huaxin", "Zhongke", "Pearl River", "Hongda", "Evergreen", "Sunrise", "Greatwall"],
  VN: ["Saigon", "Mekong", "Lotus", "Phuong Dong", "Viet Star"],
  TW: ["Formosa", "Taiyang", "Jade Mountain", "Ever Bright"],
  DE: ["Kaiser", "Brandt", "Hartmann", "Reiter", "Vogel", "Lindner"],
  IT: ["Bianchi", "Ferrari", "Colombo", "Rinaldi"],
  TR: ["Anadolu", "Bosphorus", "Ege", "Marmara"],
  MX: ["Aztec", "Del Norte", "Sierra", "Guerrero"],
  US: ["Lone Star", "Great Lakes", "Midwest", "Summit", "Gulf Coast", "Patriot"],
  JP: ["Yamato", "Kobayashi", "Sakura", "Tanaka"],
  KR: ["Hanbit", "Daehan", "Seoul Star"],
  TH: ["Siam", "Chao Phraya", "Andaman"]
};
const SUFFIX = ["Industries", "Exports", "Manufacturing", "Trading Co", "Enterprises", "Works", "Group", "Pvt Ltd", "Ltd", "GmbH", "S.p.A.", "Corp", "LLC", "Co., Ltd"];
const SUFFIX_BY_CODE = { IN: ["Industries", "Exports", "Enterprises", "Pvt Ltd", "Traders", "Mills"], CN: ["Co., Ltd", "Manufacturing", "Electronics Co., Ltd"], DE: ["GmbH", "Werke GmbH"], IT: ["S.p.A.", "S.r.l."], US: ["LLC", "Corp", "Supply Co"], JP: ["Co., Ltd", "Seiki"], KR: ["Co., Ltd"], TW: ["Co., Ltd", "Industrial Co"], VN: ["JSC", "Co., Ltd"], TR: ["A.S.", "Ltd"], MX: ["S.A. de C.V."], TH: ["Co., Ltd"] };

const TERMS = ["PayPal escrow", "Net 30", "30% advance, 70% on shipment", "Net 45", "Letter of credit"];
const CAPABILITIES = {
  DISCRETE_MANUFACTURING: ["CNC machining", "Cold forging", "Hot dip galvanizing", "Custom tooling", "Heat treatment", "Batch traceability"],
  ELECTRICAL: ["SMT assembly", "PCB fabrication", "Cable harness", "Component sourcing", "Burn-in testing", "Custom firmware"],
  TEXTILES_APPAREL: ["Spinning", "Weaving", "Dyeing and finishing", "Private label", "Sample in 7 days"],
  FOOD_AND_BEVERAGE: ["Cold chain", "Grading and sorting", "Private label packing", "Fumigation", "Export documentation"],
  PROCESS_BATCH_PRODUCTION: ["Batch blending", "Contract packing", "Quality lab", "Bulk tanker loading"],
  PACKAGING_MATERIALS: ["Custom printing", "Die cutting", "Recycled content", "Palletized shipping"],
  CLEANTECH_ENERGY: ["Module testing", "Inverter sourcing", "System design", "Warranty service"],
  CONSTRUCTION: ["Cut to size", "Container loading", "Third-party inspection"],
  RESTAURANT_EQUIPMENT: ["Stainless fabrication", "NSF certified lines", "Spare parts program"],
  JANITORIAL: ["Concentrate blending", "Private label", "Dispensing systems"],
  MEDICAL_SUPPLIES: ["Sterile packing", "Lot tracking", "FDA registered"]
};

// Extra products. [vertical, name, unit, lowCents, highCents, hub preference (country codes)]
const PRODUCTS = [
  // Fasteners and hardware
  ["DISCRETE_MANUFACTURING", "Hex Bolt M8x40 Zinc Plated Grade 8.8", "box of 500", 4200, 6800, ["IN", "CN"]],
  ["DISCRETE_MANUFACTURING", "Stainless Steel A2 Hex Nut M10", "box of 1,000", 3800, 6200, ["IN", "CN", "TW"]],
  ["DISCRETE_MANUFACTURING", "Flat Washer M12 Hot Dip Galvanized", "carton of 2,000", 2900, 4700, ["IN", "CN"]],
  ["DISCRETE_MANUFACTURING", "Self-Tapping Screw 4.8x38 Phillips Zinc", "box of 1,000", 1800, 3200, ["CN", "IN"]],
  ["DISCRETE_MANUFACTURING", "Wedge Anchor Bolt 12x120 Carbon Steel", "box of 100", 3600, 5800, ["IN", "TW"]],
  ["DISCRETE_MANUFACTURING", "Socket Head Cap Screw M6x20 Grade 12.9", "box of 500", 4500, 7200, ["TW", "DE", "IN"]],
  ["DISCRETE_MANUFACTURING", "Threaded Rod M12 Class 8.8 1m Zinc", "bundle of 50", 5200, 8400, ["IN", "CN"]],
  ["DISCRETE_MANUFACTURING", "Nyloc Lock Nut M8 Stainless", "box of 1,000", 3100, 5200, ["IN", "CN"]],
  ["DISCRETE_MANUFACTURING", "Deep Groove Ball Bearing 6204-2RS", "box of 100", 9800, 15400, ["CN", "JP", "DE"]],
  ["DISCRETE_MANUFACTURING", "Tungsten Carbide Drill Bit Set 19-piece", "case of 20", 12800, 19600, ["DE", "TW", "IN"]],
  ["DISCRETE_MANUFACTURING", "Welding Electrodes E6013 3.15mm 5kg", "case of 40", 14800, 22400, ["IN", "CN"]],
  ["DISCRETE_MANUFACTURING", "Hydraulic Bottle Jack 5 Ton", "case of 10", 22400, 33800, ["CN", "TW"]],
  ["DISCRETE_MANUFACTURING", "Angle Grinder 125mm 900W", "case of 12", 28800, 43200, ["CN", "IN", "DE"]],
  ["DISCRETE_MANUFACTURING", "Pneumatic Quick Coupling Set 1/4in", "carton of 100", 7200, 11800, ["TW", "IN"]],
  ["DISCRETE_MANUFACTURING", "Industrial Epoxy Adhesive 2-Part 400ml", "case of 24", 11800, 18400, ["DE", "IN", "US"]],
  ["DISCRETE_MANUFACTURING", "Brass Ball Valve 1/2in BSP", "carton of 50", 13400, 20800, ["IN", "IT"]],
  // Electronics
  ["ELECTRICAL", "ESP32 Development Board 38-pin WiFi Bluetooth", "box of 50", 18500, 29500, ["CN", "IN"]],
  ["ELECTRICAL", "Arduino Uno R3 Compatible Board", "box of 50", 14200, 23800, ["CN", "IN"]],
  ["ELECTRICAL", "10k Ohm 1% Metal Film Resistor Reel 5,000pc", "reel", 1900, 3400, ["CN", "IN", "TW"]],
  ["ELECTRICAL", "100uF 25V Electrolytic Capacitor Reel 2,000pc", "reel", 3200, 5400, ["CN", "TW", "JP"]],
  ["ELECTRICAL", "SMD LED 0603 Warm White Reel 4,000pc", "reel", 2600, 4600, ["CN", "KR"]],
  ["ELECTRICAL", "USB-C to USB-C Cable 1m 100W PD", "box of 100", 24000, 38000, ["CN", "IN"]],
  ["ELECTRICAL", "18650 Li-ion Cell 3000mAh 3.7V", "box of 100", 52000, 78000, ["CN", "KR", "IN"]],
  ["ELECTRICAL", "DHT22 Temperature Humidity Sensor", "box of 100", 21000, 34000, ["CN", "IN"]],
  ["ELECTRICAL", "5V 4-Channel Relay Module Optocoupled", "box of 100", 16500, 27500, ["CN", "IN"]],
  ["ELECTRICAL", "0.96in OLED Display I2C 128x64", "box of 100", 33000, 52000, ["CN", "IN"]],
  ["ELECTRICAL", "LiFePO4 Battery Pack 12.8V 20Ah", "pallet of 20", 189000, 276000, ["CN", "IN", "KR"]],
  ["ELECTRICAL", "Solder Wire 63/37 0.8mm 500g Rosin Core", "case of 20", 18400, 28600, ["IN", "DE", "CN"]],
  ["ELECTRICAL", "True RMS Digital Multimeter 6000 Count", "case of 20", 44000, 68000, ["CN", "IN", "DE"]],
  ["ELECTRICAL", "Terminal Block Connector 5.08mm 4-Pin", "box of 500", 12500, 19800, ["CN", "DE", "IN"]],
  ["ELECTRICAL", "Single-Board Computer Module 4GB Industrial", "box of 20", 98000, 148000, ["CN", "TW", "KR"]],
  ["ELECTRICAL", "LED Panel Light 18W 600x600 Warm White", "carton of 10", 24500, 39500, ["IN", "CN"]],
  ["ELECTRICAL", "Copper Wire 2.5mm FR PVC House Wire 90m", "carton of 20", 78000, 112000, ["IN", "CN"]],
  // Food and agri, Indian export goods and nuts
  ["FOOD_AND_BEVERAGE", "Cashew Kernels W320 Premium Whole", "25 kg carton", 21500, 29800, ["IN", "VN"]],
  ["FOOD_AND_BEVERAGE", "Raw Almonds Nonpareil 27/30", "25 kg carton", 17800, 24800, ["US", "IN"]],
  ["FOOD_AND_BEVERAGE", "Walnut Halves Light Extra 25kg", "25 kg carton", 15400, 22600, ["US", "IN"]],
  ["FOOD_AND_BEVERAGE", "Roasted Hazelnut Kernels 11-13mm", "25 kg carton", 23800, 34600, ["TR", "IT"]],
  ["FOOD_AND_BEVERAGE", "Basmati Rice 1121 Extra Long Grain", "50 kg sack", 5800, 8400, ["IN"]],
  ["FOOD_AND_BEVERAGE", "Darjeeling First Flush Tea FTGFOP1", "5 kg chest", 21500, 38500, ["IN"]],
  ["FOOD_AND_BEVERAGE", "Assam CTC Tea BP1 Strong", "25 kg sack", 9800, 14800, ["IN"]],
  ["FOOD_AND_BEVERAGE", "Kashmiri Saffron Grade 1 Threads", "1 kg tin", 118000, 186000, ["IN"]],
  ["FOOD_AND_BEVERAGE", "Green Cardamom 8mm Bold Alleppey", "5 kg bag", 31500, 46800, ["IN"]],
  ["FOOD_AND_BEVERAGE", "Malabar Black Pepper 550 GL", "25 kg sack", 19500, 28500, ["IN", "VN"]],
  ["FOOD_AND_BEVERAGE", "Turmeric Powder Curcumin 5% Polished", "25 kg sack", 6200, 9400, ["IN"]],
  ["FOOD_AND_BEVERAGE", "Whole Cumin Seeds Europe Grade", "25 kg sack", 8800, 13600, ["IN", "TR"]],
  ["FOOD_AND_BEVERAGE", "Pistachio Kernels Raw Sorted", "10 kg carton", 17500, 26500, ["US", "TR", "IN"]],
  ["FOOD_AND_BEVERAGE", "Medjool Dates Jumbo", "5 kg box", 6800, 10400, ["US", "IN"]],
  // Textiles
  ["TEXTILES_APPAREL", "Organic Cotton Combed Knit Fabric 180 GSM", "roll of 100 m", 38000, 58000, ["IN", "TR", "VN"]],
  ["TEXTILES_APPAREL", "Banarasi Silk Brocade Fabric Heritage Weave", "roll of 50 m", 112000, 184000, ["IN"]],
  ["TEXTILES_APPAREL", "Handloom Jute Hessian Cloth 10oz", "roll of 100 m", 21000, 33000, ["IN", "VN"]],
  ["TEXTILES_APPAREL", "Cotton Canvas Duck 12oz Natural", "roll of 50 m", 24500, 37500, ["IN", "TR"]],
  ["TEXTILES_APPAREL", "Polyester Mesh Sportswear Fabric 130 GSM", "roll of 100 m", 18800, 28800, ["VN", "CN", "IN"]],
  ["TEXTILES_APPAREL", "Block-Printed Cotton Voile Jaipur", "roll of 60 m", 26400, 40800, ["IN"]],
  // Packaging, process, construction, energy, janitorial, medical, restaurant
  ["PACKAGING_MATERIALS", "Corrugated Mailer Box 12x9x4 Kraft", "bundle of 200", 21000, 33000, ["IN", "MX", "TH"]],
  ["PACKAGING_MATERIALS", "Biodegradable Courier Bag 12x16 Compostable", "carton of 1,000", 17800, 27800, ["IN", "TH", "CN"]],
  ["PACKAGING_MATERIALS", "Food Grade PET Jar 500ml with Lid", "carton of 300", 14400, 22400, ["TH", "IN", "MX"]],
  ["PROCESS_BATCH_PRODUCTION", "Neem Cold-Pressed Oil Cosmetic Grade", "20 L drum", 12800, 19800, ["IN"]],
  ["PROCESS_BATCH_PRODUCTION", "Guar Gum Powder 200 Mesh Food Grade", "25 kg bag", 14200, 21800, ["IN"]],
  ["PROCESS_BATCH_PRODUCTION", "Castor Oil BSS Grade Pale", "200 L drum", 31000, 46000, ["IN"]],
  ["CONSTRUCTION", "Kota Stone Polished Slab 20mm", "pallet of 40", 62000, 96000, ["IN"]],
  ["CONSTRUCTION", "Ceramic Floor Tile 600x600 Glazed Vitrified", "pallet of 48", 88000, 134000, ["IN", "IT", "TR"]],
  ["CONSTRUCTION", "TMT Rebar Fe500D 12mm 12m", "bundle of 40", 96000, 144000, ["IN", "TR", "MX"]],
  ["CLEANTECH_ENERGY", "Monocrystalline Solar Panel 550W Mono PERC", "pallet of 31", 148000, 214000, ["IN", "CN", "KR"]],
  ["CLEANTECH_ENERGY", "String Inverter 10kW Three Phase", "pallet of 8", 168000, 254000, ["CN", "DE", "IN"]],
  ["CLEANTECH_ENERGY", "Solar Street Light 60W All-in-One", "carton of 6", 94000, 142000, ["IN", "CN"]],
  ["JANITORIAL", "Concentrated Floor Cleaner Lemon 5L", "case of 4", 4800, 8200, ["IN", "US"]],
  ["JANITORIAL", "Microfiber Cleaning Cloth 40x40 Pack of 12", "carton of 50", 22000, 34000, ["IN", "CN"]],
  ["MEDICAL_SUPPLIES", "Nitrile Examination Gloves Powder-Free M", "case of 1,000", 6400, 10400, ["IN", "TH", "CN"]],
  ["MEDICAL_SUPPLIES", "Surgical Face Mask 3-Ply Type IIR", "case of 2,000", 5800, 9400, ["IN", "CN"]],
  ["RESTAURANT_EQUIPMENT", "Stainless Steel Prep Table 1.5m with Shelf", "unit", 24800, 39800, ["IN", "IT", "DE"]],
  ["RESTAURANT_EQUIPMENT", "Commercial Induction Cooktop 3.5kW", "unit", 31800, 49800, ["CN", "IT", "IN"]]
];

const suppliers = [];
const byKey = new Map();

function makeSupplier(hub, index) {
  const random = rng(hash(`${hub.city}-${index}`));
  const prefix = pick(random, NAME_PREFIX[hub.code]);
  const suffix = pick(random, SUFFIX_BY_CODE[hub.code] ?? SUFFIX);
  const base = `${prefix} ${hub.style} ${suffix}`.replace(/\s+/g, " ");
  const id = `sup-${slug(hub.city)}-${slug(base).slice(0, 28)}`;
  const years = 4 + Math.floor(random() * 38);
  const certs = hub.certs.filter(() => random() < 0.72);
  if (certs.length === 0) certs.push(hub.certs[0]);
  const trust = Number((0.8 + random() * 0.19).toFixed(2));
  const lead = hub.code === "IN" || hub.code === "CN" ? 14 + Math.floor(random() * 26) : 6 + Math.floor(random() * 18);
  const site = slug(base);
  const supplier = {
    id,
    name: base,
    country: hub.country,
    countryCode: hub.code,
    city: hub.city,
    categories: hub.verticals,
    products: [],
    certifications: certs,
    capabilities: hub.verticals.flatMap((v) => (CAPABILITIES[v] ?? []).filter(() => random() < 0.5)).slice(0, 5),
    yearsInBusiness: years,
    employees: [25, 60, 120, 250, 600, 1200][Math.floor(random() * 6)],
    leadTimeDays: lead,
    minOrderUnits: [50, 100, 200, 500, 1000][Math.floor(random() * 5)],
    paymentTerms: pick(random, TERMS),
    acceptsPayPal: random() < 0.78,
    trustScore: trust,
    onTimeRatePct: Math.round(78 + random() * 21),
    defectRatePct: Number((random() * 2.4).toFixed(1)),
    website: `https://www.${site}.example`,
    contact: { name: pick(random, ["Priya Nair", "Arjun Mehta", "Li Wei", "Anika Sharma", "Marco Rinaldi", "Hannah Brandt", "Carlos Ortega", "Sofia Rossi", "Kenji Tanaka", "Ravi Iyer", "Meera Kapoor", "Jonas Keller"]), email: `sales@${site}.example` },
    tiers: [{ minUnits: 500, discountPct: 8 + Math.floor(random() * 6) }, { minUnits: 1000, discountPct: 14 + Math.floor(random() * 6) }, { minUnits: 2000, discountPct: 20 + Math.floor(random() * 8) }],
    source: "simulated",
    lastVerifiedAt: new Date(Date.UTC(2026, 9, 1 + Math.floor(random() * 38))).toISOString().slice(0, 10)
  };
  suppliers.push(supplier);
  return supplier;
}

// Build 4 suppliers per hub, so each vertical has several candidates in each region.
HUBS.forEach((hub) => {
  for (let i = 0; i < 4; i += 1) makeSupplier(hub, i);
});

// Keep the original catalog's suppliers too, so existing groups link to a record.
const seeded = JSON.parse(readFileSync("data/seeded-clans.json", "utf8"));
const known = new Set(suppliers.map((s) => s.name));
for (const clan of seeded) {
  if (!clan.supplierName || known.has(clan.supplierName)) continue;
  known.add(clan.supplierName);
  const random = rng(hash(clan.supplierName));
  const code = clan.countryCode || "US";
  const site = slug(clan.supplierName);
  suppliers.push({
    id: clan.supplierId || `sup-${site.slice(0, 28)}`,
    name: clan.supplierName,
    country: code,
    countryCode: code,
    city: clan.city,
    categories: [clan.industryVertical],
    products: [clan.canonicalSku],
    certifications: ["ISO 9001"],
    capabilities: (CAPABILITIES[clan.industryVertical] ?? []).slice(0, 2),
    yearsInBusiness: 6 + Math.floor(random() * 30),
    employees: [40, 90, 200, 450][Math.floor(random() * 4)],
    leadTimeDays: clan.estimatedDeliveryDays ?? 14,
    minOrderUnits: Math.round((clan.targetUnits || 500) * 0.2),
    paymentTerms: "PayPal escrow",
    acceptsPayPal: true,
    trustScore: clan.supplierTrustScore ?? 0.9,
    onTimeRatePct: Math.round(80 + random() * 19),
    defectRatePct: Number((random() * 2).toFixed(1)),
    website: `https://www.${site}.example`,
    contact: { name: "Sales desk", email: `sales@${site}.example` },
    tiers: (clan.discountTiers ?? []).map((tier) => ({ minUnits: tier.minUnits, discountPct: tier.discountPct })),
    source: "simulated",
    lastVerifiedAt: "2026-10-20"
  });
}

// Attach extra products to suppliers that fit their region and vertical.
const extra = {};
PRODUCTS.forEach(([vertical, name, unit, low, high, countries], index) => {
  const random = rng(hash(name));
  const candidates = suppliers.filter((s) => s.categories.includes(vertical) && countries.includes(s.countryCode) && s.source === "simulated" && s.id.startsWith("sup-"));
  const pool = candidates.length > 0 ? candidates : suppliers.filter((s) => s.categories.includes(vertical));
  const chosen = pool[Math.floor(random() * pool.length)] ?? suppliers[index % suppliers.length];
  chosen.products.push(name);
  (extra[vertical] ??= []).push({ name, unit, priceLowCents: low, priceHighCents: high, supplier: chosen.name });
});

for (const supplier of suppliers) supplier.products = [...new Set(supplier.products)];

writeFileSync("data/suppliers.json", JSON.stringify(suppliers, null, 2));
writeFileSync("data/pools/products-extra.json", JSON.stringify(extra, null, 2));
const byCountry = {};
for (const s of suppliers) byCountry[s.countryCode] = (byCountry[s.countryCode] ?? 0) + 1;
console.log(`Wrote ${suppliers.length} suppliers (${JSON.stringify(byCountry)}) and ${PRODUCTS.length} extra products in ${Object.keys(extra).length} verticals.`);
