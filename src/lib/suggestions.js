import { querySource } from "./data-sources.js";

// Prompt suggestions built from what is actually in the platform right now.
// Nothing here is a fixed list. If a dataset is empty, its suggestion is skipped.

async function safe(source, options) {
  try {
    return (await querySource(source, options)).rows;
  } catch {
    return [];
  }
}

export async function buildSuggestions() {
  const [groups, shipments, claims, ledger, suppliers] = await Promise.all([
    safe("groups", { filter: [{ field: "status", op: "eq", value: "FORMING" }], sort: { field: "fillPct", direction: "desc" }, limit: 400 }),
    safe("shipments", { limit: 50 }),
    safe("claims", { limit: 50 }),
    safe("ledger", { limit: 50 }),
    safe("suppliers", { limit: 400 })
  ]);

  const out = [];
  const nearFull = groups.filter((g) => g.fillPct >= 70 && g.fillPct < 100)[0];
  if (nearFull) out.push({ text: `Which groups are closest to filling? Start with ${nearFull.name}`, reason: `${nearFull.fillPct}% full` });

  const inTransit = shipments.find((s) => s.status === "IN_TRANSIT" && s.product);
  if (inTransit) out.push({ text: `Move the ${inTransit.product} delivery 2 days earlier`, reason: "Shipment in transit" });

  const delivered = shipments.find((s) => s.status === "DELIVERED" && s.product);
  if (delivered) out.push({ text: `Extend the inspection window for ${delivered.product} by 24 hours`, reason: "Delivered, inspection open" });

  const drafts = claims.filter((c) => String(c.status).toUpperCase().includes("DRAFT")).length;
  if (drafts > 0) out.push({ text: "Show my claims that are still drafts", reason: `${drafts} draft ${drafts === 1 ? "claim" : "claims"}` });

  if (ledger.length > 0) out.push({ text: "Show my pledges and what is held in escrow", reason: `${ledger.length} pledges` });

  const indian = groups.filter((g) => g.country === "IN")[0];
  if (indian) out.push({ text: `Show open groups in ${indian.city}`, reason: "Indian cities are covered" });

  if (suppliers.length > 0) {
    const sample = suppliers.filter((s) => s.source === "simulated" && s.countryCode === "IN")[0] ?? suppliers[0];
    const product = String(sample.products ?? "").split(";")[0].trim();
    if (product) out.push({ text: `Find new suppliers for ${product} on the web`, reason: "Kernel browser search" });
  }

  out.push({ text: "List my open PayPal invoices", reason: "Live from PayPal sandbox" });
  return out.slice(0, 6);
}
