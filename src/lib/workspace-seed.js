import crypto from "node:crypto";
import { actionDispatcher } from "./web-actions.js";
import { querySource } from "./data-sources.js";
import { getGeneratedMembers } from "./clan-members.js";
import { getClanById } from "./matchmaking/clanStore.ts";
import { getDeliveryStorage } from "../storage/delivery.storage.ts";
import { loadUserSettings, updateUserSettings } from "./user-settings.js";
import { modelClient } from "./model-client.js";

// Just in time workspace for whoever is using the site. When a business finishes onboarding, it gets its own pledges,
// an order in transit, a delivered order inside its inspection window and a late one, all built from the real catalog groups
// that match what it buys. AG Grid, Bryntum, Insights and Mosaic read the same stores, so they all show this business.
// The demo business keeps the New York story, and a restart rebuilds the same workspace from the saved profile.

const DEMO_BUSINESS = "Neon Dumpling Co.";
const STOP = new Set(["the", "and", "for", "with", "bulk", "pack", "case", "size", "grade", "premium", "organic", "from"]);
const singular = (word) => (word.length > 3 && word.endsWith("s") && !word.endsWith("ss") ? word.slice(0, -1) : word);
const wordsOf = (text) => String(text ?? "").toLowerCase().split(/[^a-z0-9]+/).filter((word) => word.length >= 3 && !STOP.has(word)).map(singular);
const slug = (text) => String(text ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 24) || "business";
const hash = (text) => crypto.createHash("sha256").update(String(text)).digest("hex");

// Catalog categories are coarse (flour and plastic resin share one), so related groups are found by what the product is.
const KINDS = [
  ["food", /flour|wheat|rice|coffee|\btea\b|\boils?\b|nuts?\b|pecan|almond|cashew|pistachio|walnut|spice|saffron|cardamom|pepper|honey|syrup|sugar|milk|dairy|cocoa|chocolate|vanilla|dates|olive|bean|grain|oats?|sesame|vinegar|jam|fruit|vegetable|bread|bakery|butter|cheese|egg|tulip|herb|matcha/i],
  ["packaging", /packag|carton|box|bag|pouch|bottle|jar|container|cup|lid|wrap|film|pallet|label|tape|takeout|napkin|tissue/i],
  ["textiles", /fabric|textile|cotton|denim|silk|wool|merino|yarn|jute|hessian|garment|apparel|thread|linen/i],
  ["electronics", /circuit|pcb|resistor|capacitor|battery|sensor|led\b|cable|wire|microcontroller|semiconductor|display|connector|inverter/i],
  ["energy", /solar|photovoltaic|geothermal|heat pump|wind|turbine|hydroponic|grow light/i],
  ["industrial", /bolt|nut\b|screw|rod|steel|aluminium|aluminum|resin|pellet|bearing|pump|valve|welding|tool|carbide|titanium|machin|casting|tile|cement|lumber|timber|rebar|concrete/i],
  ["medical", /glove|nitrile|mask|surgical|dental|scalpel|syringe|medical|scissors|gauze/i],
  ["kitchen", /kitchen|restaurant|oven|fryer|prep table|cookware|grinder|knife|induction/i]
];
const kindOf = (text) => KINDS.find(([, pattern]) => pattern.test(String(text ?? "")))?.[0] ?? "";

// The catalog groups goods into these categories. Any product the business buys is placed in one of them, first by words and
// then by asking the model, so a bicycle chain, a candle jar or a tailoring bolt of cloth all find the right neighbours.
const CATEGORIES = ["FOOD_AND_BEVERAGE", "PACKAGING_MATERIALS", "RESTAURANT_EQUIPMENT", "PROCESS_BATCH_PRODUCTION", "DISCRETE_MANUFACTURING", "CLEANTECH_ENERGY", "TEXTILES_APPAREL", "ELECTRICAL", "CONSTRUCTION", "JANITORIAL", "MEDICAL_SUPPLIES"];
const KIND_CATEGORY = { food: "FOOD_AND_BEVERAGE", packaging: "PACKAGING_MATERIALS", textiles: "TEXTILES_APPAREL", electronics: "ELECTRICAL", energy: "CLEANTECH_ENERGY", industrial: "DISCRETE_MANUFACTURING", medical: "MEDICAL_SUPPLIES", kitchen: "RESTAURANT_EQUIPMENT" };
const categoryCache = new Map();
const sameCategory = (a, b) => a === b || (a === "PACKAGING" && b === "PACKAGING_MATERIALS") || (a === "PACKAGING_MATERIALS" && b === "PACKAGING");

async function categoryFor(profile) {
  const text = `${profile.product ?? ""} ${profile.industry ?? ""}`.trim();
  if (!text) return "";
  if (categoryCache.has(text)) return categoryCache.get(text);
  let category;
  try {
    const reply = await Promise.race([
      modelClient.callChat({
        messages: [
          { role: "system", content: `Place what a small business buys into exactly one wholesale category. Answer with the category name only, chosen from: ${CATEGORIES.join(", ")}. If none of them fits the goods, answer NONE.` },
          { role: "user", content: `Business: ${profile.businessName ?? ""}. Buys: ${profile.product || profile.industry}. Industry: ${profile.industry ?? ""}.` }
        ],
        maxTokens: 24, toolChoice: "none"
      }),
      new Promise((_, reject) => setTimeout(() => reject(new Error("category lookup timed out")), 6000))
    ]);
    const answer = String(reply?.message?.content ?? "").toUpperCase();
    category = CATEGORIES.find((name) => answer.includes(name)) ?? (answer.includes("NONE") ? "" : undefined);
  } catch {
    category = undefined;
  }
  // If the model could not answer, the words decide, but only when they point to exactly one category.
  if (category === undefined) {
    const kinds = KINDS.filter(([, pattern]) => pattern.test(text)).map(([kind]) => kind);
    category = kinds.length === 1 ? KIND_CATEGORY[kinds[0]] : "";
    return category;
  }
  categoryCache.set(text, category);
  return category;
}

export function isDemoBusiness(profile) {
  return String(profile?.businessName ?? "").trim() === DEMO_BUSINESS;
}

export function workspaceOwnerId(profile) {
  return `sme_${slug(profile.businessName)}_${hash(`${profile.businessName}|${profile.city}|${profile.product}`).slice(0, 4)}`;
}

const relatedCache = new Map();
async function relatedGroups(profile, candidates, need) {
  if (need <= 0 || candidates.length === 0) return [];
  const key = `${profile.product}|${profile.industry}|${candidates.map((group) => group.id).join(",")}`;
  if (relatedCache.has(key)) return relatedCache.get(key).map((index) => candidates[index]).filter(Boolean).slice(0, need);
  let chosen = [];
  try {
    const list = candidates.map((group, index) => `${index + 1}. ${group.product}`).join("\n");
    const reply = await Promise.race([
      modelClient.callChat({
        messages: [
          { role: "system", content: `A small business wants to join wholesale buying groups. From the numbered list, choose up to ${need} items it could plausibly buy for its own work, such as the goods it sells, or what goes into them. Answer with the numbers separated by commas. Answer NONE when nothing on the list is a sensible purchase for it.` },
          { role: "user", content: `Business: ${profile.businessName ?? ""}. Industry: ${profile.industry ?? ""}. Buys: ${profile.product || profile.industry}.\n\n${list}` }
        ],
        maxTokens: 30, toolChoice: "none"
      }),
      new Promise((_, reject) => setTimeout(() => reject(new Error("related lookup timed out")), 6000))
    ]);
    const answer = String(reply?.message?.content ?? "");
    chosen = answer.toUpperCase().includes("NONE") ? [] : [...answer.matchAll(/\d+/g)].map((match) => Number(match[0]) - 1).filter((index) => index >= 0 && index < candidates.length);
    relatedCache.set(key, chosen);
  } catch {
    // Without an answer nothing unrelated is added.
    chosen = [];
  }
  return [...new Set(chosen)].map((index) => candidates[index]).slice(0, need);
}

// How well a group fits the business: what it buys first, then where it is.
// Same country is a softer signal than same city. Groups priced in USD can take a PayPal sandbox pledge, so they edge ahead.
// Words that few groups use (nut, bolt) count for more than words many groups use (stainless, steel), so a prep table is not
// mistaken for a fastener. Coverage is the share of the wanted weight that a group matches.
let WEIGHTS = new Map();
function buildWeights(rows) {
  const frequency = new Map();
  for (const row of rows) for (const word of new Set(wordsOf(`${row.product} ${row.name}`))) frequency.set(word, (frequency.get(word) || 0) + 1);
  WEIGHTS = new Map([...frequency].map(([word, count]) => [word, Math.log((rows.length + 1) / (count + 1))]));
}
const weightOf = (word) => WEIGHTS.get(word) ?? Math.log(Math.max(WEIGHTS.size, 2));

function coverageOf(group, words) {
  const text = `${group.product} ${group.name}`.toLowerCase();
  const total = words.reduce((sum, word) => sum + weightOf(word), 0) || 1;
  const hits = words.filter((word) => new RegExp(`\\b${word}s?\\b`).test(text));
  // One shared word is not enough when the business named several: a LED panel light is not a solar panel.
  if (hits.length < Math.max(1, Math.ceil(words.length / 2))) return 0;
  return hits.reduce((sum, word) => sum + weightOf(word), 0) / total;
}

function score(group, words, city, country = "") {
  const here = city && String(group.city ?? "").toLowerCase() === city ? 1 : 0;
  const sameCountry = country && String(group.country ?? "").toLowerCase() === country ? 1 : 0;
  const pledgeable = getClanById(group.id)?.settlementCurrency === "USD" ? 1 : 0;
  return coverageOf(group, words) * 30 + here * 4 + sameCountry * 2 + pledgeable * 1.5 + Math.min(Number(group.fillPct) || 0, 99) / 100;
}

function trackingFor(seed) {
  const body = hash(seed).toUpperCase().replace(/[^0-9A-Z]/g, "").slice(0, 16);
  return `1Z${body}`;
}

const hoursFromNow = (hours) => new Date(Date.now() + hours * 3600 * 1000).toISOString();

const signatureOf = (profile) => hash(`${profile.businessName}|${profile.city}|${profile.product}|${profile.units}|${profile.currentSupplier ?? ""}|${profile.currentUnitPriceUsd ?? ""}`).slice(0, 12);

// True when this profile has not been turned into a workspace yet, or what it buys has changed.
export function needsSeed(profile) {
  if (!profile?.onboardingConfirmed || !String(profile.businessName ?? "").trim() || isDemoBusiness(profile)) return false;
  if (!profile.product && !profile.city) return false;
  return profile.workspaceSig !== signatureOf(profile);
}

export async function seedWorkspaceForProfile(profile) {
  const businessName = String(profile?.businessName ?? "").trim();
  if (isDemoBusiness(profile) || !businessName) {
    // Switching back to the demo business, or clearing the profile, brings the New York story back.
    if (profile.workspaceSeeded) {
      if (profile.smeId && profile.smeId !== "sme_austin_01") getDeliveryStorage().removeByMember(profile.smeId);
      actionDispatcher.resetState();
      updateUserSettings({ profile: { smeId: "sme_austin_01", workspaceSeeded: false, workspaceSig: "", workspaceGroups: [] } });
      actionDispatcher.broadcast("WORKSPACE_SEEDED", { smeId: "sme_austin_01", groups: [] });
    }
    return { seeded: false, reason: "demo" };
  }
  if (!businessName) return { seeded: false, reason: "empty" };
  const city = String(profile.city ?? "").trim().toLowerCase();
  const country = String(profile.country ?? "").trim().toLowerCase();
  const words = wordsOf(profile.product);
  const units = Math.max(1, Math.min(Number(profile.units) || 12, 5000));
  const smeId = workspaceOwnerId(profile);
  // A previous business's generated records are replaced rather than piled up.
  if (profile.smeId && profile.smeId !== smeId && profile.smeId !== "sme_austin_01") getDeliveryStorage().removeByMember(profile.smeId);

  const { rows } = await querySource("groups", { limit: 2000 });
  buildWeights(rows);
  const open = rows.filter((group) => group.status === "FORMING" && Number(group.fillPct) < 100 && Number(group.targetUnits) > 0 && Number(group.unitPriceUsd) > 0);
  const ranked = [...open].sort((a, b) => score(b, words, city, country) - score(a, words, city, country));
  const picked = [];
  const seenProducts = new Set();
  const take = (group) => {
    if (picked.length >= 3 || seenProducts.has(group.product) || picked.includes(group)) return;
    seenProducts.add(group.product);
    picked.push(group);
  };
  // Groups that sell what the business buys come first. Then groups of the same category, so a business never gets goods
  // that have nothing to do with it. With no product named at all, nearby groups stand in.
  ranked.filter((group) => coverageOf(group, words) >= 0.5).forEach(take);
  if (picked.length < 3 && (words.length > 0 || String(profile.industry ?? "").trim())) {
    const category = await categoryFor(profile);
    const pool = (category ? ranked.filter((group) => sameCategory(group.category, category)) : []).filter((group) => !picked.includes(group));
    // The model reads the short list and keeps only goods this business could plausibly buy. Nothing is padded in.
    (await relatedGroups(profile, pool.slice(0, 30), 3 - picked.length)).forEach(take);
  }
  if (words.length === 0 && !String(profile.industry ?? "").trim()) {
    if (city) ranked.filter((group) => String(group.city ?? "").toLowerCase() === city).forEach(take);
    if (country) ranked.filter((group) => String(group.country ?? "").toLowerCase() === country).forEach(take);
  }

  // The ledger becomes this business's pledges, with a few neighbours in each group.
  actionDispatcher.coalitions.clear();
  actionDispatcher.smes.set(smeId, { id: smeId, name: businessName, maxAutoAuthorizeCents: 500000, stepUpThresholdCents: 100000, status: "VERIFIED_KYB", registeredAt: new Date().toISOString() });
  const now = new Date().toISOString();
  picked.forEach((group, index) => {
    const mine = Math.max(1, Math.round(units * [1, 0.6, 0.4][index]));
    const priceCents = Math.round(Number(group.unitPriceUsd) * 100);
    const neighbours = getGeneratedMembers(group.id).slice(0, 3).map((member) => ({
      smeId: member.smeId, name: member.name, pledgedUnits: member.pledgedUnits, authorizedCents: Math.round((member.pledgedUnits || 0) * priceCents),
      status: member.status || "PLEDGED", stepUpRequired: false, paypalOrderId: null, invoiceQrUrl: null
    }));
    const id = `coalition_${smeId}_${index + 1}`;
    actionDispatcher.coalitions.set(id, {
      id, clanId: group.id, sku: group.id, skuName: group.name,
      targetUnits: group.targetUnits, currentUnits: Math.min(index === 0 ? group.targetUnits - 1 : group.targetUnits, Number(group.currentUnits) + mine),
      unitPriceCents: priceCents, discountTierPct: Number(group.tierDiscountPct) || 0,
      status: index === 0 ? "FORMING" : "LOCKED", leaderId: smeId,
      originPort: group.supplier || profile.currentSupplier || "Supplier warehouse", destinationPort: group.city || "Your location",
      subscription: { monthlyDuesUsd: 49, yearlyDuesUsd: 499, commitmentTerm: "1_YEAR", cancellationNoticeDays: 30, updatedAt: now },
      members: [{ smeId, name: businessName, pledgedUnits: mine, authorizedCents: mine * priceCents, status: index === 0 ? "PLEDGED" : "AUTHORIZED", stepUpRequired: false, paypalOrderId: null, invoiceQrUrl: null }, ...neighbours],
      createdAt: now, updatedAt: now
    });
  });

  // Shipments for the Scheduler: one on the way, one just delivered and still inside its 48 hour window, one running late.
  const storage = getDeliveryStorage();
  const plan = [
    { group: picked[1], status: "DELIVERED", shipH: -96, expectH: -24, deliveredH: -20, note: "Delivery received." },
    { group: picked[0], status: "IN_TRANSIT", shipH: -48, expectH: 72, deliveredH: null, note: "Shipment dispatched; in transit with carrier." },
    { group: picked[2], status: "DELAYED", shipH: -120, expectH: -12, deliveredH: null, note: "Carrier reports a delay at the regional hub." }
  ].filter((entry) => entry.group);
  for (const entry of plan) {
    const id = `del-${entry.group.id}-${smeId}`;
    const mine = Math.max(1, Math.round(units * 0.5));
    storage.upsert({
      id, clanId: entry.group.id, memberId: smeId, trackingNumber: trackingFor(id), carrierName: "UPS",
      product: entry.group.name, quantity: mine, status: entry.status, conditionNotes: entry.note, rolling: entry.status,
      source: "supplier", createdAt: new Date().toISOString(),
      shipDate: hoursFromNow(entry.shipH), supplierDeliveredAt: hoursFromNow(entry.shipH), expectedDeliveryAt: hoursFromNow(entry.expectH),
      buyerDeliveredAt: entry.deliveredH === null ? null : hoursFromNow(entry.deliveredH),
      inspectionWindowEndsAt: entry.deliveredH === null ? null : hoursFromNow(entry.deliveredH + 48)
    });
  }

  updateUserSettings({ profile: { smeId, workspaceSeeded: true, workspaceSig: signatureOf(profile), workspaceGroups: picked.map((group) => group.id) } });
  actionDispatcher.broadcast("WORKSPACE_SEEDED", { smeId, groups: picked.map((group) => group.name) });
  return { seeded: true, smeId, groups: picked.map((group) => ({ id: group.id, name: group.name, city: group.city })) };
}

// After a restart the ledger is rebuilt from the story, so a judge's workspace is rebuilt from their saved profile.
export async function restoreWorkspace() {
  const profile = loadUserSettings().profile ?? {};
  if (profile.workspaceSeeded && profile.businessName && !isDemoBusiness(profile)) {
    try { await seedWorkspaceForProfile(profile); } catch { /* the story data stays */ }
  }
}
