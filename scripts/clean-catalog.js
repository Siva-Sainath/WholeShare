// Cleans the generated catalog so the app reads like a real marketplace. Ids stay the same. Repeatable.
//   1. Names drop the "Purchasing Syndicate" style suffixes.
//   2. Groups that share a city and product get the supplier in their name, so "the olive oil group" is never ambiguous.
//   3. No open group is listed above its target.
//   4. Placeholder tracking numbers (XXX) become well formed ones.
// Usage: node scripts/clean-catalog.js
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const read = (path) => JSON.parse(readFileSync(resolve(root, path), "utf8"));
const write = (path, value) => writeFileSync(resolve(root, path), `${JSON.stringify(value, null, 2)}\n`, "utf8");

const SUFFIX = /\s+(Purchasing Syndicate|Buying Group|Trade Cooperative|Bulk Buyers Circle|Buyers Circle|Procurement Syndicate|Syndicate|Cooperative)\s*$/i;
const shortSupplier = (name) => String(name || "").replace(/[.,]/g, "").split(/\s+/).slice(0, 2).join(" ");

const clans = read("data/seeded-clans.json");
let renamed = 0;
let capped = 0;

for (const clan of clans) {
  if (clan.id.startsWith("clan-flushing-")) continue;
  // Names are rebuilt from the product, so they always say what the group buys.
  const product = String(clan.canonicalSku || "").replace(/\s*\([^)]*\)\s*$/, "").replace(SUFFIX, "").trim();
  let name = `${clan.city} ${product}`;
  if (name.length > 64) name = name.slice(0, 64).replace(/\s+\S*$/, "");
  if (name !== clan.name) { clan.name = name; renamed += 1; }
  if (clan.status === "FORMING" && clan.currentUnits > clan.targetUnits - 1) {
    clan.currentUnits = Math.max(0, Math.floor(clan.targetUnits * 0.97));
    capped += 1;
  }
}

const buckets = new Map();
for (const clan of clans) {
  const key = `${clan.city}|${clan.canonicalSku}`;
  buckets.set(key, [...(buckets.get(key) || []), clan]);
}
let disambiguated = 0;
for (const group of buckets.values()) {
  if (group.length < 2 || group[0].id.startsWith("clan-flushing-")) continue;
  const used = new Set();
  group.forEach((clan, index) => {
    let tag = shortSupplier(clan.supplierName) || `Group ${index + 1}`;
    if (used.has(tag)) tag = `${tag} ${index + 1}`;
    used.add(tag);
    if (!clan.name.includes(`(${tag})`)) { clan.name = `${clan.name} (${tag})`; disambiguated += 1; }
  });
}
write("data/seeded-clans.json", clans);

const deliveryPath = ".scratch/developer-2-escrow-settlement-disputes/delivery-records.json";
const deliveries = read(deliveryPath);
const records = Array.isArray(deliveries) ? deliveries : deliveries.records;
let tracking = 0;
const alnum = "ABCDEFGHJKLMNPQRSTUVWXYZ0123456789";
records.forEach((record, index) => {
  if (!/XXX/i.test(String(record.trackingNumber))) return;
  let seed = (index + 7) * 2654435761;
  let body = "";
  for (let i = 0; i < 16; i += 1) { seed = (seed * 1103515245 + 12345) >>> 0; body += alnum[seed % alnum.length]; }
  record.trackingNumber = `1Z${body}`;
  tracking += 1;
});
write(deliveryPath, Array.isArray(deliveries) ? records : { ...deliveries, records });

console.log(`Catalog cleaned: ${renamed} renamed, ${disambiguated} disambiguated, ${capped} capped, ${tracking} tracking numbers fixed.`);
