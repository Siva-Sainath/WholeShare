// Adds the New York, Queens story to the sample data: independent restaurants pooling orders to reach supplier tiers.
// Additive and repeatable. Everything it writes is sample data and is labelled that way.
//   groups   -> data/seeded-clans.json            (ids clan-flushing-*)
//   members  -> data/generated/clan-members.json  (named local businesses)
//   suppliers-> data/suppliers.json               (source "simulated")
//   shipments-> .scratch/developer-2-escrow-settlement-disputes/delivery-records.json (rolling, see src/lib/story-clock.js)
// Usage: node scripts/generate-story-flushing.js
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const read = (path) => JSON.parse(readFileSync(resolve(root, path), "utf8"));
const write = (path, value) => writeFileSync(resolve(root, path), `${JSON.stringify(value, null, 2)}\n`, "utf8");

const CITY = { city: "New York", countryCode: "US", settlementCurrency: "USD", lat: 40.7675, lng: -73.8331, corridorId: "Port Newark / JFK Air Cargo" };
const NOW = Date.now();
const daysAgo = (n) => new Date(NOW - n * 86400000).toISOString();

const SUPPLIERS = [
  { id: "sup-flushing-garden-state-packaging", name: "Garden State Paper & Packaging", city: "Edison", state: "NJ", categories: ["PACKAGING_MATERIALS"], products: ["Kraft Takeout Container 32 oz with Lid", "Clear PET Cups 16 oz with Dome Lids"], leadTimeDays: 5, minOrderUnits: 10, trustScore: 0.97, onTimeRatePct: 98, defectRatePct: 0.8 },
  { id: "sup-flushing-eastern-wholesale-imports", name: "Eastern Wholesale Packaging Imports", city: "Newark", state: "NJ", categories: ["PACKAGING_MATERIALS"], products: ["Kraft Takeout Container 32 oz with Lid"], leadTimeDays: 12, minOrderUnits: 20, trustScore: 0.86, onTimeRatePct: 91, defectRatePct: 2.9 },
  { id: "sup-flushing-hudson-safety", name: "Hudson Safety Supply", city: "Jersey City", state: "NJ", categories: ["RESTAURANT_EQUIPMENT"], products: ["Nitrile Exam Gloves Powder Free"], leadTimeDays: 7, minOrderUnits: 10, trustScore: 0.94, onTimeRatePct: 96, defectRatePct: 1.2 },
  { id: "sup-flushing-bangkok-rice", name: "Bangkok Rice Exporters Co.", city: "Bangkok", state: "", country: "Thailand", countryCode: "TH", categories: ["FOOD_AND_BEVERAGE"], products: ["Jasmine Rice Hom Mali 25 lb Bag"], leadTimeDays: 24, minOrderUnits: 40, trustScore: 0.95, onTimeRatePct: 94, defectRatePct: 0.9 },
  { id: "sup-flushing-queens-foodservice", name: "Queens Foodservice Distributors", city: "Long Island City", state: "NY", categories: ["FOOD_AND_BEVERAGE"], products: ["Soybean Cooking Oil 35 lb Jug"], leadTimeDays: 4, minOrderUnits: 20, trustScore: 0.9, onTimeRatePct: 95, defectRatePct: 1.4 },
  { id: "sup-flushing-brooklyn-cup", name: "Brooklyn Cup & Lid Co.", city: "Brooklyn", state: "NY", categories: ["PACKAGING_MATERIALS"], products: ["Clear PET Cups 16 oz with Dome Lids"], leadTimeDays: 5, minOrderUnits: 10, trustScore: 0.88, onTimeRatePct: 93, defectRatePct: 2.1 }
].map((s) => ({
  country: "United States", countryCode: "US", certifications: ["FDA food contact compliant"], capabilities: ["Case and pallet pricing", "Next day Queens delivery windows"],
  yearsInBusiness: 14, employees: 60, paymentTerms: "Net 30", acceptsPayPal: true, website: `https://www.${s.id.replace("sup-flushing-", "")}.example`,
  contact: { name: "Sales desk", email: `sales@${s.id.replace("sup-flushing-", "")}.example` }, source: "simulated", ...s
}));

// unit = the pack a restaurant actually buys. Prices in cents.
const GROUPS = [
  { key: "containers-garden-state", name: "New York Takeout Containers 32 oz (Garden State)", sku: "Kraft Takeout Container 32 oz with Lid (case of 150)", vertical: "PACKAGING_MATERIALS", hs: "4819.20", base: 3150, target: 80, current: 38, tiers: [[20, 8], [40, 14], [80, 22]], days: 5, supplier: "sup-flushing-garden-state-packaging", trust: 0.97 },
  { key: "containers-eastern", name: "New York Takeout Containers 32 oz (Eastern Imports)", sku: "Kraft Takeout Container 32 oz with Lid (case of 150)", vertical: "PACKAGING_MATERIALS", hs: "4819.20", base: 2790, target: 80, current: 41, tiers: [[20, 10], [40, 18], [80, 26]], days: 12, supplier: "sup-flushing-eastern-wholesale-imports", trust: 0.86 },
  { key: "gloves", name: "New York Nitrile Gloves (case of 1,000)", sku: "Nitrile Exam Gloves Powder Free Black Medium (case of 1,000)", vertical: "RESTAURANT_EQUIPMENT", hs: "4015.12", base: 6400, target: 60, current: 32, tiers: [[20, 8], [40, 14], [60, 20]], days: 7, supplier: "sup-flushing-hudson-safety", trust: 0.94 },
  { key: "rice", name: "New York Jasmine Rice 25 lb", sku: "Jasmine Rice Hom Mali 25 lb Bag", vertical: "FOOD_AND_BEVERAGE", hs: "1006.30", base: 2450, target: 120, current: 84, tiers: [[40, 8], [80, 14], [120, 20]], days: 24, supplier: "sup-flushing-bangkok-rice", trust: 0.95, crossBorder: true },
  { key: "cooking-oil", name: "New York Soybean Cooking Oil 35 lb", sku: "Soybean Cooking Oil 35 lb Jug", vertical: "FOOD_AND_BEVERAGE", hs: "1507.90", base: 4600, target: 60, current: 39, tiers: [[20, 6], [40, 12], [60, 18]], days: 4, supplier: "sup-flushing-queens-foodservice", trust: 0.9 },
  { key: "cups", name: "New York Clear Cups 16 oz with Lids", sku: "Clear PET Cups 16 oz with Dome Lids (case of 1,000)", vertical: "PACKAGING_MATERIALS", hs: "3924.10", base: 5800, target: 50, current: 29, tiers: [[10, 6], [30, 12], [50, 18]], days: 5, supplier: "sup-flushing-brooklyn-cup", trust: 0.88 }
];

const BUSINESSES = ["Jade Garden Noodle Bar", "Sweet Pearl Bubble Tea", "Main Street Dumpling House", "Lucky Panda Takeout", "Chengdu Spice House", "New York Bakery & Buns", "Taste of Xi'an", "Harmony Hot Pot", "Pearl River Seafood", "Golden Wok Express"];
const PERSONA = { smeId: "sme_austin_01", name: "Golden Lotus Kitchen" };

const discountAt = (group, units) => group.tiers.reduce((best, [min, pct]) => (units >= min ? Math.max(best, pct) : best), 0);

function buildMembers(group, index) {
  const total = group.current;
  const people = [PERSONA, ...BUSINESSES.slice(index % 4, (index % 4) + 4).map((name, i) => ({ smeId: `sme_fl_${group.key.replace(/-/g, "")}_${i}`, name }))];
  const weights = people.map((_, i) => 3 + ((i * 5 + index * 3) % 6));
  const sum = weights.reduce((a, b) => a + b, 0);
  let left = total;
  return people.map((person, i) => {
    const units = i === people.length - 1 ? left : Math.max(1, Math.round((weights[i] / sum) * total));
    left -= units;
    const unitCents = Math.round(group.base * (100 - discountAt(group, group.current)) / 100);
    return { smeId: person.smeId, name: person.name, pledgedUnits: units, authorizedCents: units * unitCents, status: i % 3 === 0 ? "AUTHORIZED" : "PLEDGED", paypalOrderId: null, pledgedAt: daysAgo(2 + ((i * 3 + index) % 18)) };
  });
}

// Groups, members and suppliers
const clans = read("data/seeded-clans.json");
const members = read("data/generated/clan-members.json");
const suppliers = read("data/suppliers.json");
const supplierList = Array.isArray(suppliers) ? suppliers : suppliers.suppliers;

GROUPS.forEach((group, index) => {
  const id = `clan-flushing-${group.key}`;
  const supplier = SUPPLIERS.find((s) => s.id === group.supplier);
  const clan = {
    id, name: group.name, industryVertical: group.vertical, canonicalSku: group.sku, hsCodePrefix: group.hs, ...CITY,
    targetUnits: group.target, currentUnits: group.current, baseUnitPriceCents: group.base,
    discountTiers: group.tiers.map(([minUnits, discountPct]) => ({ minUnits, discountPct })),
    estimatedDeliveryDays: group.days, supplierId: supplier.id.replace("sup-flushing-", "supp-fl-"), supplierName: supplier.name, supplierTrustScore: group.trust,
    memberCount: 0, status: "FORMING", isCrossBorder: Boolean(group.crossBorder), createdAt: daysAgo(12 - index), demo: true,
    fulfilment: { mode: "SINGLE_POINT", points: [{ label: "Back door, Main St", address: "", city: "New York", countryCode: "US" }] }
  };
  const list = buildMembers(group, index);
  clan.memberCount = list.length;
  const at = clans.findIndex((c) => c.id === id);
  if (at >= 0) clans[at] = clan; else clans.unshift(clan);
  members[id] = list;
});
for (const supplier of SUPPLIERS) {
  const at = supplierList.findIndex((s) => s.id === supplier.id);
  if (at >= 0) supplierList[at] = supplier; else supplierList.unshift(supplier);
}
write("data/seeded-clans.json", clans);
write("data/generated/clan-members.json", members);
write("data/suppliers.json", Array.isArray(suppliers) ? supplierList : { ...suppliers, suppliers: supplierList });

// Shipments for the delivery and dispute beats. Dates are rebased to "now" at boot by src/lib/story-clock.js.
const deliveryPath = ".scratch/developer-2-escrow-settlement-disputes/delivery-records.json";
const deliveries = read(deliveryPath);
const records = Array.isArray(deliveries) ? deliveries : deliveries.records;
const retired = ["del-clan-flushing-cooking-oil-sme_austin_01"];
const story = [
  { id: "del-clan-flushing-containers-garden-state-sme_austin_01", clanId: "clan-flushing-containers-garden-state", trackingNumber: "1ZV4R8A903651102A7", carrierName: "UPS", product: "Kraft Takeout Container 32 oz with Lid (case of 150)", quantity: 12, status: "IN_TRANSIT", conditionNotes: "Shipment dispatched; in transit with carrier.", rolling: "IN_TRANSIT" },
  { id: "del-clan-flushing-containers-eastern-sme_austin_01", clanId: "clan-flushing-containers-eastern", trackingNumber: "1ZV4R8A90365110931", carrierName: "UPS", product: "Kraft Takeout Container 32 oz with Lid (case of 150)", quantity: 8, status: "DELIVERED", conditionNotes: "Delivery received. Several cartons were crushed in the truck.", rolling: "DELIVERED" }
].map((record) => ({ memberId: "sme_austin_01", source: "supplier", createdAt: daysAgo(3), ...record }));
for (const id of retired) { const gone = records.findIndex((r) => r.id === id); if (gone >= 0) records.splice(gone, 1); }
for (const record of story) {
  const at = records.findIndex((r) => r.id === record.id);
  if (at >= 0) records[at] = { ...records[at], ...record }; else records.push(record);
}
write(deliveryPath, Array.isArray(deliveries) ? records : { ...deliveries, records });

console.log(`Story data written: ${GROUPS.length} groups, ${SUPPLIERS.length} suppliers, ${story.length} shipments.`);
