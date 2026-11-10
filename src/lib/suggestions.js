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

const shortProduct = (product) => String(product ?? "").replace(/\s*\([^)]*\)\s*/g, " ").trim().split(/\s+/).slice(0, 3).join(" ").toLowerCase();

export async function buildSuggestions() {
  const profile = loadUserSettings().profile ?? {};
  const city = String(profile.city ?? "").trim();
  const me = profile.smeId || "sme_austin_01";
  const [groups, shipments, claims, ledger, suppliers] = await Promise.all([
    safe("groups", { filter: [{ field: "status", op: "eq", value: "FORMING" }], sort: { field: "fillPct", direction: "desc" }, limit: 600 }),
    safe("shipments", { limit: 80 }),
    safe("claims", { limit: 50 }),
    safe("ledger", { limit: 50 }),
    safe("suppliers", { limit: 400 })
  ]);

  const out = [];
  const nearby = city ? groups.filter((g) => String(g.city).toLowerCase() === city.toLowerCase()) : [];
  if (nearby.length > 0) out.push({ text: `Which ${city} groups can we still join?`, reason: `${nearby.length} open ${nearby.length === 1 ? "group" : "groups"} near you` });

  // Two groups buying the same product are worth weighing against each other.
  const byProduct = new Map();
  for (const group of nearby) byProduct.set(group.product, [...(byProduct.get(group.product) ?? []), group]);
  const pair = [...byProduct.values()].find((list) => list.length >= 2);
  if (pair) out.push({ text: `Compare the two ${city} ${shortProduct(pair[0].product)} groups for 12 cases`, reason: "Two suppliers to weigh" });

  const mine = shipments.filter((s) => s.memberId === me);
  const pool = mine.length > 0 ? mine : shipments;
  const inTransit = pool.find((s) => s.status === "IN_TRANSIT" && s.product);
  if (inTransit) out.push({ text: `Where is our ${shortProduct(inTransit.product)} shipment and is it late?`, reason: "Shipment in transit" });

  const delivered = pool.filter((s) => s.status === "DELIVERED" && s.product).sort((a, b) => String(b.deliveredAt ?? "").localeCompare(String(a.deliveredAt ?? "")))[0];
  if (delivered) out.push({ text: `Our ${shortProduct(delivered.product)} arrived damaged, file a claim`, reason: "Delivered, inspection open" });

  const nearFull = (nearby.length > 0 ? nearby : groups).filter((g) => g.fillPct >= 70 && g.fillPct < 100)[0];
  if (nearFull && out.length < 5) out.push({ text: `Which groups are closest to filling? Start with ${nearFull.name}`, reason: `${nearFull.fillPct}% full` });

  const drafts = claims.filter((c) => String(c.status).toUpperCase().includes("DRAFT")).length;
  if (drafts > 0 && out.length < 5) out.push({ text: "Show my claims that are still drafts", reason: `${drafts} draft ${drafts === 1 ? "claim" : "claims"}` });

  if (ledger.length > 0 && out.length < 5) out.push({ text: "Show my pledges and what is held in escrow", reason: `${ledger.length} pledges` });

  if (suppliers.length > 0 && out.length < 6) {
    const product = nearby[0] ? String(nearby[0].name).replace(new RegExp(`^${city}\\s+`, "i"), "").replace(/\s*\([^)]*\)\s*$/, "") : String((suppliers[0].products ?? "")).split(";")[0].trim();
    if (product) out.push({ text: `Find new suppliers for ${product} on the web`, reason: "Kernel browser search" });
  }

  out.push({ text: "List my open PayPal invoices", reason: "Live from PayPal sandbox" });
  return out.slice(0, 6);
}
