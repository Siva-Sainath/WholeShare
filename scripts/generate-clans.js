import { readFileSync, writeFileSync } from "node:fs";

// Adds varied buying groups on top of the original seed. Original ids are never changed,
// because shipments and claims reference them. Generated ids start with clan-gen- so a rerun replaces them.

const seeded = JSON.parse(readFileSync("data/seeded-clans.json", "utf8")).filter((clan) => !String(clan.id).startsWith("clan-gen-"));
const baseProducts = JSON.parse(readFileSync("data/pools/products.json", "utf8"));
const extraProducts = JSON.parse(readFileSync("data/pools/products-extra.json", "utf8"));
const suppliers = JSON.parse(readFileSync("data/suppliers.json", "utf8"));
const supplierByName = new Map(suppliers.map((s) => [s.name, s]));
const products = {};
for (const source of [baseProducts, extraProducts]) {
  for (const [vertical, list] of Object.entries(source)) products[vertical] = [...(products[vertical] ?? []), ...list];
}
const worldCities = JSON.parse(readFileSync("data/world-cities.json", "utf8"));

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

const cityInfo = new Map();
for (const clan of seeded) {
  if (!cityInfo.has(clan.city)) {
    cityInfo.set(clan.city, { countryCode: clan.countryCode, currency: clan.settlementCurrency, corridorId: clan.corridorId, lat: clan.lat, lng: clan.lng });
  }
}
const indianCities = [];
for (const entry of worldCities.filter((c) => c.countryCode === "IN").slice(0, 40)) {
  if (!cityInfo.has(entry.city)) cityInfo.set(entry.city, { countryCode: "IN", currency: entry.paypalCurrency || "INR", corridorId: entry.majorPortOrHub, lat: entry.lat, lng: entry.lng });
  indianCities.push(entry.city);
}
const cities = [...cityInfo.keys()];
const isIndiaFriendly = (product) => (supplierByName.get(product.supplier)?.countryCode ?? "") === "IN";
const SUFFIXES = ["Purchasing Syndicate", "Buying Group", "Wholesale Pool", "Bulk Buyers Circle"];
const SIZES = [100, 150, 200, 250, 300, 400, 500, 800, 1000, 1500, 2000, 3000, 5000];

const generated = [];
for (const [vertical, list] of Object.entries(products)) {
  for (const product of list) {
    const random = rng(hash(vertical + product.name));
    const cityCount = 2 + Math.floor(random() * 3);
    const picked = new Set();
    const pool = isIndiaFriendly(product) ? indianCities : cities;
    while (picked.size < cityCount) picked.add(pool[Math.floor(random() * pool.length)]);
    for (const city of picked) {
      const info = cityInfo.get(city);
      const target = SIZES[Math.floor(random() * SIZES.length)];
      const progress = random();
      const current = Math.floor(target * progress * (random() < 0.12 ? 1.05 : 1));
      const price = Math.round(product.priceLowCents + random() * (product.priceHighCents - product.priceLowCents));
      const status = current >= target ? "LOCKED" : "FORMING";
      const short = product.name.split(" ").slice(0, 3).join(" ");
      generated.push({
        id: `clan-gen-${slug(city)}-${slug(product.name).slice(0, 40)}`,
        name: `${city} ${short} ${SUFFIXES[Math.floor(random() * SUFFIXES.length)]}`,
        industryVertical: vertical,
        canonicalSku: product.name,
        hsCodePrefix: `${String(1000 + Math.floor(random() * 8000)).slice(0, 4)}.${String(10 + Math.floor(random() * 80))}`,
        city,
        countryCode: info.countryCode,
        settlementCurrency: info.currency,
        targetUnits: target,
        currentUnits: current,
        baseUnitPriceCents: price,
        discountTiers: [
          { minUnits: Math.round(target * 0.25), discountPct: 10 + Math.floor(random() * 8) },
          { minUnits: Math.round(target * 0.5), discountPct: 18 + Math.floor(random() * 8) },
          { minUnits: target, discountPct: 26 + Math.floor(random() * 10) }
        ],
        estimatedDeliveryDays: 3 + Math.floor(random() * 19),
        supplierId: supplierByName.get(product.supplier)?.id ?? `supp-${slug(product.supplier).slice(0, 24)}`,
        supplierName: product.supplier,
        supplierTrustScore: Number((0.85 + random() * 0.14).toFixed(2)),
        corridorId: info.corridorId,
        lat: info.lat,
        lng: info.lng,
        memberCount: Math.max(1, Math.min(25, Math.round(current / Math.max(1, target / (3 + Math.floor(random() * 18)))))),
        status,
        isCrossBorder: info.countryCode !== "US",
        createdAt: new Date(Date.UTC(2026, 10, 9 - Math.floor(random() * 25))).toISOString(),
        demo: true
      });
    }
  }
}

const seen = new Set();
const unique = generated.filter((clan) => (seen.has(clan.id) ? false : (seen.add(clan.id), true)));
writeFileSync("data/seeded-clans.json", JSON.stringify([...seeded, ...unique], null, 2));
const buckets = [0, 0, 0, 0, 0];
for (const clan of unique) buckets[Math.min(4, Math.floor(Math.min(clan.currentUnits / clan.targetUnits, 0.999) * 5))] += 1;
console.log(`Added ${unique.length} groups across ${Object.keys(products).length} verticals. Progress buckets: ${buckets.join(", ")}.`);
