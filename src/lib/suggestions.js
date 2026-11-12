import { querySource } from "./data-sources.js";
import { loadUserSettings } from "./user-settings.js";

// Prompt suggestions built from what is actually in the platform right now, for the person using it.
// Nothing here is a fixed list. If a dataset is empty, its suggestion is skipped.

async function safe(source, options) {
  try {
    return (await querySource(source, options)).rows;
  } catch {
    return [];
  }
}

const shortProduct = (product) => {
  const words = String(product ?? "").replace(/\s*\([^)]*\)\s*/g, " ").trim().split(/\s+/);
  const end = words.findIndex((word) => /\d/.test(word));
  return words.slice(0, end > 0 ? Math.min(end, 4) : 4).join(" ").toLowerCase();
};

const STOP = new Set(["the", "and", "for", "with", "bulk", "pack", "case", "size", "grade", "premium", "organic"]);
const wordsOf = (text) => String(text ?? "").toLowerCase().split(/[^a-z0-9]+/).filter((word) => word.length >= 3 && !STOP.has(word));

export async function buildSuggestions() {
  const profile = loadUserSettings().profile ?? {};
  const city = String(profile.city ?? "").trim();
  const product = String(profile.product ?? "").trim();
  const units = Number(profile.units) > 0 ? Number(profile.units) : 12;
  const me = profile.smeId || "sme_austin_01";
  const [groups, shipments, claims, ledger, suppliers] = await Promise.all([
    safe("groups", { filter: [{ field: "status", op: "eq", value: "FORMING" }], sort: { field: "fillPct", direction: "desc" }, limit: 600 }),
    safe("shipments", { limit: 200 }),
    safe("claims", { limit: 100 }),
    safe("ledger", { limit: 100 }),
    safe("suppliers", { limit: 400 })
  ]);

  // What the business buys decides what is relevant. With no product on the profile, what it already has in transit or on order does, then the city.
  const own = shipments.filter((entry) => entry.memberId === me && entry.product);
  const fromHistory = product ? "" : shortProduct((own.find((entry) => entry.status === "IN_TRANSIT") ?? own[0])?.product);
  const wanted = wordsOf(product || fromHistory);
  const matches = (group) => wanted.length === 0 || wanted.some((word) => new RegExp(`\\b${word}s?\\b`).test(`${group.product} ${group.name}`.toLowerCase()));
  const relevant = groups.filter(matches);
  const nearby = city ? relevant.filter((g) => String(g.city).toLowerCase() === city.toLowerCase()) : [];
  const pool = nearby.length > 0 ? nearby : relevant;
  const label = product || fromHistory || (pool[0] ? shortProduct(pool[0].product) : "");

  const out = [];
  if (pool.length > 0 && label) out.push({ text: `Which ${label} groups can we still join${nearby.length > 0 ? ` in ${city}` : ""}?`, reason: `${pool.length} open ${pool.length === 1 ? "group" : "groups"}${nearby.length > 0 ? " near you" : ""}` });
  else if (city) out.push({ text: `Which groups can we still join in ${city}?`, reason: "Open groups near you" });

  // Two groups buying the same product are worth weighing against each other.
  const byProduct = new Map();
  for (const group of pool) byProduct.set(group.product, [...(byProduct.get(group.product) ?? []), group]);
  const pair = [...byProduct.values()].find((list) => list.length >= 2);
  if (pair) out.push({ text: `Compare the two ${shortProduct(pair[0].product)} groups for ${units} units`, reason: "Two suppliers to weigh" });
  else if (pool.length >= 2) out.push({ text: `Compare the two closest ${label} groups for ${units} units`, reason: "Weigh price, delivery and trust" });

  // Shipments and claims only appear when they belong to this business.
  const mine = shipments.filter((s) => s.memberId === me);
  const inTransit = mine.find((s) => s.status === "IN_TRANSIT" && s.product);
  if (inTransit) out.push({ text: `Where is our ${shortProduct(inTransit.product)} shipment and is it late?`, reason: "Shipment in transit" });
  const delivered = mine.filter((s) => s.status === "DELIVERED" && s.product).sort((a, b) => String(b.deliveredAt ?? "").localeCompare(String(a.deliveredAt ?? "")))[0];
  if (delivered) out.push({ text: `Our ${shortProduct(delivered.product)} arrived damaged, file a claim`, reason: "Delivered, inspection open" });

  const drafts = claims.filter((c) => c.memberId === me && String(c.status).toUpperCase().includes("DRAFT")).length;
  if (drafts > 0 && out.length < 5) out.push({ text: "Show my claims that are still drafts", reason: `${drafts} draft ${drafts === 1 ? "claim" : "claims"}` });
  if (ledger.some((row) => row.memberId === me) && out.length < 5) out.push({ text: "Show my pledges and what is held in escrow", reason: "Held on PayPal" });

  if (label && out.length < 6) {
    const known = suppliers.some((supplier) => wanted.some((word) => new RegExp(`\\b${word}s?\\b`).test(String(supplier.products ?? "").toLowerCase())));
    out.push({ text: `Find new suppliers for ${label} on the web`, reason: known ? "Kernel browser search" : "No directory suppliers yet" });
  }
  if (label && pool.length === 0) out.push({ text: `Start a group buy for ${label}${city ? ` in ${city}` : ""}`, reason: "No open group yet" });

  out.push({ text: "List my open PayPal invoices", reason: "Live from PayPal sandbox" });
  return out.slice(0, 6);
}
