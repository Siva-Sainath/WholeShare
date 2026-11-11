import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { actionDispatcher } from "./web-actions.js";
import { getClanById } from "./matchmaking/clanStore.ts";
import { currentOwnerId, loadUserSettings } from "./user-settings.js";
import { captureOrderHold, refundCapture } from "./paypal-bridge.js";
import { getDeliveryStorage } from "../storage/delivery.storage.ts";

// A pledge is a PayPal hold the business approved. This keeps each one on disk, puts it in the ledger the app shows,
// and releases it (captures the hold) once the goods are confirmed. A restart rebuilds the ledger from this file.

const FILE = () => process.env.WHOLESHARE_PLEDGES_FILE || resolve(process.cwd(), "data/pledges.json");

function readAll() {
  try {
    return existsSync(FILE()) ? JSON.parse(readFileSync(FILE(), "utf8")) : [];
  } catch {
    return [];
  }
}

function writeAll(list) {
  const path = FILE();
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.tmp.${process.pid}`;
  writeFileSync(tmp, JSON.stringify(list.slice(-500), null, 2), "utf8");
  renameSync(tmp, path);
}

function topDiscount(clan) {
  return (clan?.discountTiers ?? []).reduce((best, tier) => (Number(clan.currentUnits) >= tier.minUnits ? Math.max(best, tier.discountPct) : best), 0);
}

// Puts one pledge into the ledger coalition for its group, creating the coalition when the business has none there yet.
function syncIntoLedger(pledge) {
  const clan = getClanById(pledge.clanId);
  let coalition = [...actionDispatcher.coalitions.values()].find((entry) => entry.clanId === pledge.clanId);
  const now = new Date().toISOString();
  if (!coalition) {
    const id = `coalition_${pledge.smeId}_${String(pledge.clanId).replace(/[^a-z0-9]+/gi, "_").slice(-40)}`;
    coalition = {
      id, clanId: pledge.clanId, sku: pledge.clanId, skuName: clan?.name ?? pledge.clanId,
      targetUnits: clan?.targetUnits ?? pledge.units, currentUnits: clan?.currentUnits ?? pledge.units,
      unitPriceCents: Math.round(pledge.amountCents / Math.max(1, pledge.units)), discountTierPct: topDiscount(clan),
      status: "FORMING", leaderId: pledge.smeId, originPort: clan?.supplierName ?? "Supplier warehouse", destinationPort: clan?.city ?? "Your location",
      subscription: { monthlyDuesUsd: 49, yearlyDuesUsd: 499, commitmentTerm: "1_YEAR", cancellationNoticeDays: 30, updatedAt: now },
      members: [], createdAt: now, updatedAt: now
    };
    actionDispatcher.coalitions.set(id, coalition);
  }
  const existing = coalition.members.find((member) => member.smeId === pledge.smeId);
  const status = pledge.status === "CAPTURED" ? "CAPTURED" : "AUTHORIZED";
  if (existing) {
    // Re-applying the same pledge after a restart must not add its units twice.
    if (existing.paypalOrderId !== pledge.orderId) {
      existing.pledgedUnits = (existing.pledgedUnits || 0) + pledge.units;
      existing.authorizedCents = (existing.authorizedCents || 0) + pledge.amountCents;
    }
    Object.assign(existing, { name: pledge.businessName, status, paypalOrderId: pledge.orderId, authorizationId: pledge.authorizationId, captureId: pledge.captureId ?? null });
  } else {
    coalition.members.push({ smeId: pledge.smeId, name: pledge.businessName, pledgedUnits: pledge.units, authorizedCents: pledge.amountCents, status, stepUpRequired: false, paypalOrderId: pledge.orderId, authorizationId: pledge.authorizationId, captureId: pledge.captureId ?? null, invoiceQrUrl: null });
  }
  coalition.currentUnits = coalition.members.reduce((sum, member) => sum + (member.pledgedUnits || 0), 0);
  coalition.updatedAt = now;
}

// Called when PayPal has authorized a pledge.
export function recordPledge({ clanId, units, amountCents, currency = "USD", orderId, authorizationId, businessName }) {
  const list = readAll().filter((entry) => entry.orderId !== orderId);
  const pledge = { orderId, smeId: currentOwnerId(), clanId, units, amountCents, currency, authorizationId, businessName: businessName || loadUserSettings().profile?.businessName || "Your business", status: "AUTHORIZED", createdAt: new Date().toISOString() };
  list.push(pledge);
  writeAll(list);
  syncIntoLedger(pledge);
  actionDispatcher.broadcast("PLEDGE_RECORDED", { clanId, smeId: pledge.smeId, orderId });
  return pledge;
}

// After a restart or a rebuilt workspace, every pledge the business made is put back in the ledger.
export function applyPledgesToLedger() {
  const owner = currentOwnerId();
  for (const pledge of readAll().filter((entry) => entry.smeId === owner)) {
    try { syncIntoLedger(pledge); } catch { /* one bad record does not stop the rest */ }
  }
}

export function listPledges(smeId = currentOwnerId()) {
  return readAll().filter((entry) => entry.smeId === smeId);
}

export function findPledge(clanId, smeId = currentOwnerId()) {
  return readAll().filter((entry) => entry.smeId === smeId && entry.clanId === clanId).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))[0] ?? null;
}

// Captures the PayPal hold for a group once its goods are confirmed. Without a real hold it only records the release, and says so.
export async function releasePayment({ clanId, smeId = currentOwnerId() }, { capture = captureOrderHold } = {}) {
  const pledge = findPledge(clanId, smeId);
  if (!pledge) return { released: false, reason: "No pledge from this business in that group." };
  if (pledge.status === "CAPTURED") return { released: true, alreadyReleased: true, captureId: pledge.captureId, amountCents: pledge.amountCents };
  const record = getDeliveryStorage().getByMember(clanId, smeId);
  if (!record?.buyerDeliveredAt) return { released: false, reason: "The goods have not been confirmed as delivered yet." };
  const result = await capture({ authorizationId: pledge.authorizationId, amountCents: pledge.amountCents, currency: pledge.currency });
  const list = readAll().map((entry) => (entry.orderId === pledge.orderId ? { ...entry, status: "CAPTURED", captureId: result.captureId, capturedAt: new Date().toISOString() } : entry));
  writeAll(list);
  syncIntoLedger({ ...pledge, status: "CAPTURED", captureId: result.captureId });
  actionDispatcher.broadcast("PLEDGE_RELEASED", { clanId, smeId, captureId: result.captureId });
  return { released: true, captureId: result.captureId, authorizationId: pledge.authorizationId, amountCents: pledge.amountCents, currency: pledge.currency, paypalStatus: result.status };
}

// The sample supplier marks the goods delivered. This is the one supplier-side step the app plays itself, and the UI labels it so.
export function markDelivered({ clanId, smeId = currentOwnerId() }) {
  const clan = getClanById(clanId);
  const pledge = findPledge(clanId, smeId);
  const storage = getDeliveryStorage();
  const existing = storage.getByMember(clanId, smeId);
  const now = new Date();
  const record = {
    id: existing?.id ?? `del-${clanId}-${smeId}`, clanId, memberId: smeId,
    trackingNumber: existing?.trackingNumber ?? `1Z${(smeId + clanId).replace(/[^A-Za-z0-9]/g, "").toUpperCase().padEnd(16, "7").slice(-16)}`,
    carrierName: existing?.carrierName ?? "UPS", product: existing?.product ?? clan?.name ?? clanId, quantity: existing?.quantity ?? pledge?.units ?? 1,
    status: "DELIVERED", conditionNotes: "Delivered by the sample supplier.", rolling: "DELIVERED", source: "supplier", createdAt: existing?.createdAt ?? now.toISOString(),
    shipDate: existing?.shipDate ?? new Date(now.getTime() - 3 * 86400000).toISOString(),
    supplierDeliveredAt: now.toISOString(), expectedDeliveryAt: existing?.expectedDeliveryAt ?? now.toISOString(),
    buyerDeliveredAt: now.toISOString(), inspectionWindowEndsAt: new Date(now.getTime() + 48 * 3600 * 1000).toISOString()
  };
  storage.upsert(record);
  actionDispatcher.broadcast("SCHEDULE_CHANGED", { change: { kind: "delivered", shipmentId: record.id } });
  return record;
}

// Pays out for a settled claim. A captured payment is refunded for the damaged units. A hold that is still open is captured for the intact
// units only, and the rest of the hold is released. With no PayPal hold behind the order, it says so and records the amount owed.
export async function settleClaimPayment({ clanId, memberId, amountCents }, { capture = captureOrderHold, refund = refundCapture } = {}) {
  const pledge = findPledge(clanId, memberId);
  if (!pledge?.authorizationId) return { refundId: "LOCAL-RECORD", rawResponse: { note: "No PayPal hold on this order. The refund is a local record.", amountCents } };
  if (pledge.status === "CAPTURED" && pledge.captureId) {
    const issued = await refund({ captureId: pledge.captureId, amountCents, currency: pledge.currency, note: "WholeShare refund for damaged units" });
    return { refundId: issued.refundId, rawResponse: { ...issued.rawResponse, kind: "REFUND" } };
  }
  const net = Math.max(1, pledge.amountCents - amountCents);
  const partial = await capture({ authorizationId: pledge.authorizationId, amountCents: net, currency: pledge.currency, isFinalCapture: true });
  const list = readAll().map((entry) => (entry.orderId === pledge.orderId ? { ...entry, status: "CAPTURED", captureId: partial.captureId, capturedAt: new Date().toISOString(), capturedCents: net, releasedCents: amountCents } : entry));
  writeAll(list);
  syncIntoLedger({ ...pledge, status: "CAPTURED", captureId: partial.captureId });
  return { refundId: partial.captureId, rawResponse: { kind: "PARTIAL_CAPTURE", capturedCents: net, releasedCents: amountCents, note: "The supplier was paid for the intact units and the rest of the hold was released." } };
}
