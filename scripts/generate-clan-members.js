import { readFileSync, writeFileSync, existsSync } from "node:fs";

// Deterministic member rosters for every seeded buying group.
// Each roster matches its group: the member count, the sum of pledged units, and the status.
// Rerunning produces the same file, so the demo data never drifts.

const clans = JSON.parse(readFileSync("data/seeded-clans.json", "utf8")).filter((clan) => !String(clan.id).startsWith("clan-test-"));
const pools = JSON.parse(readFileSync("data/pools/business-names.json", "utf8"));

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

const MEMBER_STATUS = { FORMING: ["PLEDGED", "PLEDGED", "AUTHORIZED"], LOCKED: ["AUTHORIZED"], PAYPAL_AUTH_LOCKED: ["AUTHORIZED"], SETTLED: ["CAPTURED"] };

const output = {};
for (const clan of clans) {
  const random = rng(hash(clan.id));
  const names = [...(pools[clan.industryVertical] ?? []), ...pools.GENERAL];
  const count = Math.max(1, Math.min(Number(clan.memberCount) || 3, 40, Math.max(1, clan.currentUnits)));
  const weights = Array.from({ length: count }, () => 0.4 + random());
  const weightTotal = weights.reduce((sum, w) => sum + w, 0);
  let remaining = clan.currentUnits;
  const picked = new Set();
  const members = [];
  for (let i = 0; i < count; i += 1) {
    let name = names[Math.floor(random() * names.length)];
    let guard = 0;
    while (picked.has(name) && guard < 80) {
      name = names[Math.floor(random() * names.length)];
      guard += 1;
    }
    picked.add(name);
    const units = i === count - 1 ? remaining : Math.max(1, Math.min(remaining - (count - 1 - i), Math.round((clan.currentUnits * weights[i]) / weightTotal)));
    remaining -= units;
    const statuses = MEMBER_STATUS[clan.status] ?? ["PLEDGED"];
    const discount = clan.discountTiers?.reduce((best, tier) => (clan.currentUnits >= tier.minUnits ? Math.max(best, tier.discountPct) : best), 0) ?? 0;
    const unitCents = Math.round((clan.baseUnitPriceCents * (100 - discount)) / 100);
    const daysAgo = Math.floor(random() * 28);
    members.push({
      smeId: `sme_${hash(clan.id + name).toString(36)}`,
      name,
      pledgedUnits: units,
      authorizedCents: units * unitCents,
      status: statuses[Math.floor(random() * statuses.length)],
      paypalOrderId: null,
      pledgedAt: new Date(Date.UTC(2026, 10, 9 - daysAgo, 9 + Math.floor(random() * 8), Math.floor(random() * 60))).toISOString()
    });
  }
  output[clan.id] = members;
}

writeFileSync("data/generated/clan-members.json", JSON.stringify(output));
const rows = Object.values(output).reduce((sum, list) => sum + list.length, 0);
console.log(`Generated ${rows} member rows for ${Object.keys(output).length} groups.`);
