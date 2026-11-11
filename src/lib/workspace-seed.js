import crypto from "node:crypto";
import { actionDispatcher } from "./web-actions.js";
import { querySource } from "./data-sources.js";
import { getGeneratedMembers } from "./clan-members.js";
import { getDeliveryStorage } from "../storage/delivery.storage.ts";
import { loadUserSettings, updateUserSettings } from "./user-settings.js";

// Just in time workspace for whoever is using the site. When a business finishes onboarding, it gets its own pledges,
// an order in transit, a delivered order inside its inspection window and a late one, all built from the real catalog groups
// that match what it buys. AG Grid, Bryntum, Insights and Mosaic read the same stores, so they all show this business.
// The demo business keeps the Flushing story, and a restart rebuilds the same workspace from the saved profile.

const DEMO_BUSINESS = "Golden Lotus Kitchen";
const STOP = new Set(["the", "and", "for", "with", "bulk", "pack", "case", "size", "grade", "premium", "organic", "from"]);
const wordsOf = (text) => String(text ?? "").toLowerCase().split(/[^a-z0-9]+/).filter((word) => word.length >= 3 && !STOP.has(word));
const slug = (text) => String(text ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 24) || "business";
const hash = (text) => crypto.createHash("sha256").update(String(text)).digest("hex");

export function isDemoBusiness(profile) {
  return String(profile?.businessName ?? "").trim() === DEMO_BUSINESS;
}

export function workspaceOwnerId(profile) {
  return `sme_${slug(profile.businessName)}_${hash(`${profile.businessName}|${profile.city}|${profile.product}`).slice(0, 4)}`;
}

// How well a group fits the business: what it buys first, then where it is.
function score(group, words, city) {
  const text = `${group.product} ${group.name}`.toLowerCase();
  const matched = words.filter((word) => new RegExp(`\\b${word}s?\\b`).test(text)).length;
  const here = city && String(group.city ?? "").toLowerCase() === city ? 1 : 0;
  return matched * 10 + here * 4 + Math.min(Number(group.fillPct) || 0, 99) / 100;
}

function trackingFor(seed) {
  const body = hash(seed).toUpperCase().replace(/[^0-9A-Z]/g, "").slice(0, 16);
  return `1Z${body}`;
}

const hoursFromNow = (hours) => new Date(Date.now() + hours * 3600 * 1000).toISOString();

const signatureOf = (profile) => hash(`${profile.businessName}|${profile.city}|${profile.product}|${profile.units}`).slice(0, 12);

// True when this profile has not been turned into a workspace yet, or what it buys has changed.
export function needsSeed(profile) {
  if (!profile?.onboardingConfirmed || !String(profile.businessName ?? "").trim() || isDemoBusiness(profile)) return false;
  if (!profile.product && !profile.city) return false;
  return profile.workspaceSig !== signatureOf(profile);
}

export async function seedWorkspaceForProfile(profile) {
  const businessName = String(profile?.businessName ?? "").trim();
  if (isDemoBusiness(profile) || !businessName) {
    // Switching back to the demo business, or clearing the profile, brings the Flushing story back.
    if (profile.workspaceSeeded) {
      actionDispatcher.resetState();
      updateUserSettings({ profile: { smeId: "sme_austin_01", workspaceSeeded: false, workspaceSig: "", workspaceGroups: [] } });
      actionDispatcher.broadcast("WORKSPACE_SEEDED", { smeId: "sme_austin_01", groups: [] });
    }
    return { seeded: false, reason: "demo" };
  }
  if (!businessName) return { seeded: false, reason: "empty" };
  const city = String(profile.city ?? "").trim().toLowerCase();
  const words = wordsOf(profile.product);
  const units = Math.max(1, Math.min(Number(profile.units) || 12, 5000));
  const smeId = workspaceOwnerId(profile);

  const { rows } = await querySource("groups", { limit: 2000 });
  const open = rows.filter((group) => group.status === "FORMING" && Number(group.fillPct) < 100 && Number(group.targetUnits) > 0);
  const ranked = [...open].sort((a, b) => score(b, words, city) - score(a, words, city));
  const picked = [];
  const seenProducts = new Set();
  for (const group of ranked) {
    if (seenProducts.has(group.product)) continue;
    seenProducts.add(group.product);
    picked.push(group);
    if (picked.length === 3) break;
  }
  if (picked.length === 0) return { seeded: false, reason: "no open groups" };

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
      originPort: group.supplier || "Supplier warehouse", destinationPort: group.city || "Your location",
      subscription: { monthlyDuesUsd: 49, yearlyDuesUsd: 499, commitmentTerm: "1_YEAR", cancellationNoticeDays: 30, updatedAt: now },
      members: [{ smeId, name: businessName, pledgedUnits: mine, authorizedCents: mine * priceCents, status: index === 0 ? "PLEDGED" : "AUTHORIZED", stepUpRequired: false, paypalOrderId: null, invoiceQrUrl: null }, ...neighbours],
      createdAt: now, updatedAt: now
    });
  });

  // Shipments for the Scheduler: one on the way, one just delivered and still inside its 48 hour window, one running late.
  const storage = getDeliveryStorage();
  const plan = [
    { group: picked[1] ?? picked[0], status: "DELIVERED", shipH: -96, expectH: -24, deliveredH: -20, note: "Delivery received." },
    { group: picked[0], status: "IN_TRANSIT", shipH: -48, expectH: 72, deliveredH: null, note: "Shipment dispatched; in transit with carrier." },
    { group: picked[2] ?? picked[0], status: "DELAYED", shipH: -120, expectH: -12, deliveredH: null, note: "Carrier reports a delay at the regional hub." }
  ];
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
