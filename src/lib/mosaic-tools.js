// General tools for Mosaic. They return facts to the model so it can reason, instead of steering the screen.
//   query          any data source: filter, sort, group, total
//   resolve        words from the user -> real ids
//   compare_groups side by side facts for two to four buying groups
import { querySource, resolveSourceId, SOURCES } from "./data-sources.js";
import { getClanById } from "./matchmaking/clanStore.ts";
import { actionDispatcher } from "./web-actions.js";
import { loadUserSettings } from "./user-settings.js";

const MAX_ROWS = 25;
const OPS = new Set(["sum", "avg", "count", "min", "max"]);

const scalar = (row, fields) => {
  const entries = Object.entries(row).filter(([key, value]) => value !== null && typeof value !== "object" && (!fields || fields.includes(key)));
  return Object.fromEntries(fields ? entries : entries.slice(0, 14));
};

const round = (n) => Math.round(Number(n) * 100) / 100;

export async function runQuery(args = {}) {
  const sourceId = resolveSourceId(args.source);
  if (!SOURCES[sourceId]) return { error: `Unknown source '${args.source}'. Known sources: ${Object.keys(SOURCES).join(", ")}.` };
  const fields = Array.isArray(args.fields) && args.fields.length ? args.fields.map(String) : null;
  const aggregates = (Array.isArray(args.aggregate) ? args.aggregate : []).filter((a) => a && OPS.has(a.op) && typeof a.field === "string");
  const sort = args.sort && typeof args.sort.field === "string" ? args.sort : null;
  const limit = Math.min(Math.max(Number(args.limit) || 10, 1), MAX_ROWS);

  let result;
  try {
    result = await querySource(sourceId, { filter: args.filter || [], sort: args.groupBy || aggregates.length ? null : sort, limit: 20000 });
  } catch (cause) {
    return { error: cause.message };
  }
  const available = result.rows[0] ? Object.keys(result.rows[0]).filter((key) => typeof result.rows[0][key] !== "object") : [];
  const base = { source: sourceId, label: result.label, matching: result.total, availableFields: available };

  if (args.groupBy || aggregates.length) {
    const key = typeof args.groupBy === "string" ? args.groupBy : null;
    if (key && available.length && !available.includes(key)) return { error: `Cannot group by '${key}'. Fields: ${available.join(", ")}.` };
    const buckets = new Map();
    for (const row of result.rows) {
      const bucketKey = key ? String(row[key] ?? "none") : "all";
      if (!buckets.has(bucketKey)) buckets.set(bucketKey, []);
      buckets.get(bucketKey).push(row);
    }
    const groups = [...buckets.entries()].map(([bucketKey, rows]) => {
      const out = { ...(key ? { [key]: bucketKey } : {}), count: rows.length };
      for (const { field, op } of aggregates) {
        const nums = rows.map((row) => Number(row[field])).filter(Number.isFinite);
        const value = op === "count" ? rows.length : op === "sum" ? nums.reduce((t, n) => t + n, 0) : op === "avg" ? nums.reduce((t, n) => t + n, 0) / Math.max(nums.length, 1) : op === "min" ? Math.min(...nums) : Math.max(...nums);
        out[`${op}_${field}`] = round(value);
      }
      return out;
    });
    const orderBy = sort?.field ?? (aggregates[0] ? `${aggregates[0].op}_${aggregates[0].field}` : "count");
    const dir = sort?.direction === "asc" ? 1 : -1;
    groups.sort((a, b) => (a[orderBy] > b[orderBy] ? dir : a[orderBy] < b[orderBy] ? -dir : 0));
    return { ...base, groupedBy: key, groupCount: groups.length, groups: groups.slice(0, limit) };
  }

  // Long rows slow every later model call. Keep what fits in about 6,000 characters and say how many were cut.
  let rows = result.rows.slice(0, limit).map((row) => scalar(row, fields));
  let trimmed = 0;
  while (rows.length > 3 && JSON.stringify(rows).length > 6000) {
    rows = rows.slice(0, -1);
    trimmed += 1;
  }
  const out = { ...base, shown: rows.length, rows, ...(trimmed ? { trimmed: `${trimmed} more rows matched but were left out to keep this short. Ask for fewer fields or a narrower filter.` } : {}) };
  if (args.show === true && result.rows.length > 0) {
    const artifact = { kind: sourceId === "groups" && args.view !== "grid" ? "groups" : sourceId === "paypal_invoices" && args.view !== "grid" ? "invoices" : "grid", title: String(args.title || result.label).slice(0, 80), source: sourceId, filter: Array.isArray(args.filter) ? args.filter : [], sort, limit: Math.min(Math.max(Number(args.panelLimit) || 50, limit), 200), count: result.rows.length, total: result.total };
    actionDispatcher.broadcast("UI_ACTION", { type: "PRESENT", artifact, timestamp: new Date().toISOString() });
    return { ...out, status: "SUCCESS", action: "PRESENT", artifact, panel: "The table is open beside the chat." };
  }
  return out;
}

const STOP = new Set(["the", "and", "for", "with", "from", "that", "this", "group", "groups", "buying", "clan", "shipment", "supplier", "claim", "invoice", "one", "my", "me", "please", "join", "compare", "show"]);
const stem = (word) => (word.length > 3 && word.endsWith("s") ? word.slice(0, -1) : word);
const tokensOf = (text) => String(text ?? "").toLowerCase().split(/[^a-z0-9]+/).filter((word) => word.length > 1 && !STOP.has(word)).map(stem);

const RESOLVE = {
  group: { source: "groups", fields: ["name", "product", "city", "category", "supplier"], show: ["id", "name", "city", "status", "fillPct", "unitPriceUsd"] },
  shipment: { source: "shipments", fields: ["product", "carrier", "tracking", "groupId", "status"], show: ["id", "product", "status", "expectedAt"] },
  supplier: { source: "suppliers", fields: ["name", "products", "city", "country", "categories"], show: ["id", "name", "city", "country", "source"] },
  claim: { source: "claims", fields: ["id", "groupId", "status"], show: ["id", "groupId", "status", "claimedUsd"] },
  invoice: { source: "paypal_invoices", fields: ["number", "billedTo", "status"], show: ["id", "number", "status", "dueUsd"] }
};

export async function resolveEntity(args = {}) {
  if (Array.isArray(args.text)) return { results: await Promise.all(args.text.slice(0, 4).map((text) => resolveEntity({ type: args.type, text }))) };
  const spec = RESOLVE[String(args.type || "").toLowerCase()];
  if (!spec) return { error: `type must be one of: ${Object.keys(RESOLVE).join(", ")}.` };
  const wanted = tokensOf(args.text);
  if (wanted.length === 0) return { error: "Give the words the user used for it." };
  const { rows } = await querySource(spec.source, { limit: 20000 });
  const text = String(args.text).toLowerCase();
  const scored = rows.map((row) => {
    if (String(row.id).toLowerCase() === text.trim()) return { row, score: 100 };
    const hay = new Set(tokensOf(spec.fields.map((field) => row[field]).join(" ")));
    const hits = wanted.filter((word) => hay.has(word) || [...hay].some((h) => h.length > 3 && word.length > 3 && (h.startsWith(word) || word.startsWith(h))));
    return { row, score: hits.length / wanted.length + (hits.length ? 0.01 * hits.length : 0) };
  }).filter((entry) => entry.score >= 0.5);
  // Among equally good text matches, prefer what a person would most likely mean: groups they can still join and that are closest to full, the most recent shipment.
  const tier = (entry) => Math.round(entry.score * 5);
  const recency = (row) => Date.parse(row.deliveredAt || row.expectedAt || row.createdAt || "") || 0;
  scored.sort((a, b) => tier(b) - tier(a) || (a.row.status === "FORMING" ? 0 : 1) - (b.row.status === "FORMING" ? 0 : 1) || (b.row.fillPct ?? 0) - (a.row.fillPct ?? 0) || recency(b.row) - recency(a.row) || b.score - a.score);
  const top = scored.slice(0, 5);
  const close = top.length > 1 && tier(top[0]) === tier(top[1]);
  return {
    type: args.type,
    candidates: top.map(({ row, score }) => ({ ...scalar(row, spec.show), match: round(score) })),
    recommended: top[0] ? top[0].row.id : null,
    note: top.length === 0 ? "No match. Ask the user to say it differently, or use query to browse." : close ? "Several groups, shipments or items match equally well. Use recommended (the first one) unless the user's words or the page context point to another, and tell the user which one you chose and that they can switch." : "Clear best match: the first one."
  };
}

// Accepts ids or the user's own words. Words are resolved here, so one call replaces several round trips.
export async function groupIdFromWords(words) {
  const found = await resolveEntity({ type: "group", text: String(words) });
  return found.recommended ? { id: found.recommended, name: found.candidates?.[0]?.name, alternatives: found.candidates.slice(1, 3).map((c) => c.name) } : null;
}

export async function compareGroups(args = {}) {
  let ids = (Array.isArray(args.groupIds) ? args.groupIds : []).map(String).filter(Boolean);
  const chosen = [];
  if (ids.length === 0 && Array.isArray(args.groups)) {
    // Each phrase takes its best match that was not already taken, so "the two container groups" becomes two different groups.
    let firstCandidates = [];
    for (const words of args.groups.slice(0, 4)) {
      const found = await resolveEntity({ type: "group", text: String(words) });
      if (firstCandidates.length === 0) firstCandidates = found.candidates ?? [];
      const pick = (found.candidates ?? []).find((candidate) => !ids.includes(candidate.id));
      if (!pick) continue;
      ids.push(pick.id);
      chosen.push({ asked: words, chose: pick.name, otherMatches: (found.candidates ?? []).filter((c) => c.id !== pick.id).slice(0, 2).map((c) => c.name) });
    }
    for (const candidate of firstCandidates) {
      if (ids.length >= 2) break;
      if (!ids.includes(candidate.id)) { ids.push(candidate.id); chosen.push({ asked: String(args.groups[0]), chose: candidate.name, otherMatches: [] }); }
    }
    if (ids.length < 2) return { error: "Could not find two different groups for that. Ask the user which groups to compare." };
  }
  if (ids.length < 2 || ids.length > 4) return { error: "Give two to four group ids. Use resolve first to find them." };
  const units = Math.min(Math.max(Math.round(Number(args.units)) || 100, 1), 10000);
  const saved = loadUserSettings().profile ?? {};
  const payToday = Number(saved.currentUnitPriceUsd) > 0 ? Number(saved.currentUnitPriceUsd) : null;
  const groups = [];
  for (const id of ids) {
    const clan = getClanById(id);
    if (!clan) return { error: `No buying group with id '${id}'. Use resolve to find the right one.` };
    const tiers = [...(clan.discountTiers || [])].sort((a, b) => a.minUnits - b.minUnits);
    const discountFor = (n) => tiers.reduce((best, tier) => (n >= tier.minUnits ? Math.max(best, tier.discountPct) : best), 0);
    const projected = clan.currentUnits + units;
    const discount = discountFor(projected);
    const unitPrice = (clan.baseUnitPriceCents * (100 - discount)) / 100 / 100;
    const next = tiers.find((tier) => tier.minUnits > projected);
    const remaining = Math.max(clan.targetUnits - clan.currentUnits, 0);
    groups.push({
      id: clan.id, name: clan.name, city: clan.city, status: clan.status, joinable: clan.status === "FORMING" && remaining >= units,
      currency: "USD", supplierSettlesIn: clan.settlementCurrency, listUnitPrice: round(clan.baseUnitPriceCents / 100),
      discountPctAtYourUnits: discount, unitPriceAtYourUnits: round(unitPrice), totalForYourUnits: round(unitPrice * units),
      nextTier: next ? { atUnits: next.minUnits, discountPct: next.discountPct, unitsAway: next.minUnits - projected } : null,
      fillPct: clan.targetUnits ? Math.round((clan.currentUnits / clan.targetUnits) * 100) : 0, unitsRemaining: remaining,
      deliveryDays: clan.estimatedDeliveryDays ?? null, supplier: clan.supplierName ?? "", supplierTrust: clan.supplierTrustScore ?? null,
      payPalCheckoutAvailable: true,
      ...(payToday ? { youPayTodayUnitPrice: payToday, savingVersusTodayForYourUnits: round(payToday * units - unitPrice * units) } : {})
    });
  }
  const sameCurrency = new Set(groups.map((g) => g.currency)).size === 1;
  const best = (list, key, dir) => (list.length ? [...list].sort((a, b) => (dir === "min" ? a[key] - b[key] : b[key] - a[key]))[0].name : null);
  const joinable = groups.filter((g) => g.joinable);
  const verdict = {
    cheapestTotal: sameCurrency ? best(joinable.length ? joinable : groups, "totalForYourUnits", "min") : "not comparable, prices are in different currencies",
    fastestDelivery: best(groups.filter((g) => g.deliveryDays !== null), "deliveryDays", "min"),
    mostTrustedSupplier: best(groups.filter((g) => g.supplierTrust !== null), "supplierTrust", "max"),
    closestToFilling: best(joinable, "fillPct", "max")
  };
  const artifact = { kind: "compare", title: `Comparing ${groups.length} groups for ${units} units`, note: "Prices and totals use the units you asked about. The best value in each row is marked.", compare: { units, groups, verdict } };
  actionDispatcher.broadcast("UI_ACTION", { type: "PRESENT", artifact, timestamp: new Date().toISOString() });
  return { status: "SUCCESS", action: "PRESENT", artifact, unitsCompared: units, groups, verdict, ...(chosen.length ? { resolvedFromWords: chosen } : {}), note: "Totals assume the user pledges the units shown. Say which factor decides it and what the user gives up." };
}
