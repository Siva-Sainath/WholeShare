import { getAllClans, getClanById } from "./matchmaking/clanStore.ts";
import { actionDispatcher } from "./web-actions.js";
import { getClaimsStorage } from "../storage/claims.storage.ts";
import { getDeliveryStorage } from "../storage/delivery.storage.ts";
import { getGeneratedMembers } from "./clan-members.js";
import { isCarrierFormatTracking } from "./tracking-format.js";
import { executeTool } from "./tool-registry.js";
import { supplierRows } from "./supplier-search.js";

// One named place for every dataset the app can show. AG Grid artifacts, AG Studio and Mosaic's read tools
// all read through here, so a number means the same thing on every screen.

const INVOICE_TTL_MS = 60 * 1000;
let invoiceCache = { at: 0, rows: [] };

function discountAtUnits(clan) {
  const tiers = Array.isArray(clan.discountTiers) ? clan.discountTiers : [];
  return tiers.filter((tier) => clan.currentUnits >= tier.minUnits).reduce((best, tier) => Math.max(best, tier.discountPct), 0);
}

function groupRows() {
  return getAllClans().map((clan) => {
    const reached = discountAtUnits(clan);
    const listCents = clan.baseUnitPriceCents ?? 0;
    return {
      id: clan.id,
      name: clan.name,
      product: clan.canonicalSku,
      category: clan.industryVertical,
      city: clan.city,
      country: clan.countryCode,
      status: clan.status,
      currentUnits: clan.currentUnits,
      targetUnits: clan.targetUnits,
      fillPct: clan.targetUnits ? Math.round((clan.currentUnits / clan.targetUnits) * 100) : 0,
      listPriceUsd: listCents / 100,
      tierDiscountPct: reached,
      unitPriceUsd: Math.round(listCents * (100 - reached)) / 10000,
      shipmentMode: clan.fulfilment?.mode ?? "SINGLE_POINT",
      receivingPoints: clan.fulfilment?.points?.length ?? 1,
      supplier: clan.supplierName ?? "",
      supplierTrust: clan.supplierTrustScore ?? null,
      demo: clan.demo === true
    };
  });
}

function ledgerRows() {
  return actionDispatcher.getLedgerState().flatMap((group) =>
    (group.members || []).map((member) => ({
      id: `${group.coalitionId}:${member.smeId}`,
      groupId: group.coalitionId,
      group: group.skuName,
      groupStatus: group.status,
      memberId: member.smeId,
      member: member.name ?? member.smeId,
      units: member.pledgedUnits,
      authorizedUsd: (member.authorizedCents || 0) / 100,
      status: member.status,
      paypalOrderId: member.paypalOrderId ?? null
    }))
  );
}

function memberRows() {
  const rows = [];
  for (const clan of getAllClans()) {
    for (const member of getGeneratedMembers(clan.id)) {
      rows.push({
        id: `${clan.id}:${member.smeId}`,
        groupId: clan.id,
        memberId: member.smeId,
        member: member.name,
        units: member.pledgedUnits,
        authorizedUsd: (member.authorizedCents || 0) / 100,
        status: member.status
      });
    }
  }
  return rows;
}

function claimRows() {
  const byClan = new Map(getAllClans().map((clan) => [clan.id, clan]));
  return getClaimsStorage().getAll().map((claim) => ({
    id: claim.claimId,
    groupId: claim.clanId,
    product: byClan.get(claim.clanId)?.canonicalSku ?? "",
    city: byClan.get(claim.clanId)?.city ?? "",
    memberId: claim.memberId,
    damagedUnits: claim.damagedUnits,
    claimedUsd: claim.claimedAmount,
    status: claim.status,
    createdAt: claim.createdAt
  }));
}

function shipmentRows() {
  return getDeliveryStorage()
    .getAll()
    .filter((record) => record.source !== "simulated" && isCarrierFormatTracking(record.trackingNumber))
    .map((record) => ({
      id: record.id,
      groupId: record.clanId,
      product: record.product,
      carrier: record.carrierName,
      tracking: record.trackingNumber,
      quantity: record.quantity,
      shippedAt: record.shipDate ?? null,
      expectedAt: record.expectedDeliveryAt ?? null,
      deliveredAt: record.buyerDeliveredAt ?? null,
      inspectionEndsAt: record.inspectionWindowEndsAt ?? null,
      status: record.status ?? (record.buyerDeliveredAt ? "DELIVERED" : "IN_TRANSIT"),
      receivingPoint: (getClanById(record.clanId)?.fulfilment?.points ?? []).map((point) => [point.label, point.city].filter(Boolean).join(", ")).join(" | ") || "Not set"
    }));
}

async function paypalInvoiceRows() {
  if (Date.now() - invoiceCache.at < INVOICE_TTL_MS) return invoiceCache.rows;
  const result = await executeTool("paypal_execute_toolkit_action", { action: "list_invoices", parameters: {} });
  const parsed = typeof result?.result === "string" ? JSON.parse(result.result) : result?.result;
  if (parsed?.error) throw new Error(parsed.error.message || "PayPal did not return invoices.");
  const rows = (Array.isArray(parsed?.items) ? parsed.items : []).map((item) => ({
    id: item.id,
    number: item.detail?.invoice_number ?? "",
    status: item.status,
    issuedAt: item.detail?.invoice_date ?? null,
    billedTo: sandboxSafeRecipient(item.primary_recipients?.[0]?.billing_info?.email_address),
    amountUsd: Number(item.amount?.value ?? 0),
    dueUsd: Number(item.due_amount?.value ?? item.amount?.value ?? 0),
    note: item.detail?.note ?? ""
  }));
  invoiceCache = { at: Date.now(), rows };
  return rows;
}

// Invoices created by tests in the PayPal sandbox use throwaway addresses. Show them as what they are.
function sandboxSafeRecipient(email) {
  if (!email) return "";
  return /@(example\.com|wholeshare\.local)$/i.test(email) ? "Sandbox buyer" : email;
}

export const SOURCES = {
  groups: { label: "Buying groups", description: "Every buying group in the catalog. Demo groups are marked demo. Unit price already includes the tier discount reached.", rows: groupRows },
  members: { label: "Group members", description: "Pledges per member across all groups. Generated demo data.", rows: memberRows },
  ledger: { label: "My pledges", description: "Members of the groups you joined, as held in the local ledger. Not verified against PayPal unless a PayPal order id is present.", rows: ledgerRows },
  claims: { label: "Damage claims", description: "Damage claims and their approval status.", rows: claimRows },
  shipments: { label: "Shipments", description: "Shipments with carrier tracking numbers and inspection windows.", rows: shipmentRows },
  suppliers: { label: "Suppliers", description: "Supplier directory. Rows marked simulated are a generated demo directory. Rows marked web lead come from a live Kernel browser search and are unverified.", rows: supplierRows },
  paypal_invoices: { label: "PayPal invoices", description: "Live invoices from the PayPal sandbox account, cached for one minute.", rows: paypalInvoiceRows }
};

const ALIASES = { coalitions: "groups", coalition: "groups", clans: "groups", buying_groups: "groups", pledges: "ledger", my_pledges: "ledger", ledger_members: "ledger", disputes: "claims", damage_claims: "claims", shipment: "shipments", invoices: "paypal_invoices", paypal: "paypal_invoices", member: "members", supplier: "suppliers", vendors: "suppliers", sellers: "suppliers" };

export function resolveSourceId(id) {
  const key = String(id || "").trim().toLowerCase().replace(/[\s-]+/g, "_");
  return SOURCES[key] ? key : ALIASES[key] || key;
}

export function listSources() {
  return Object.entries(SOURCES).map(([id, source]) => ({ id, label: source.label, description: source.description }));
}

const OPERATORS = {
  eq: (a, b) => String(a).toLowerCase() === String(b).toLowerCase(),
  ne: (a, b) => String(a).toLowerCase() !== String(b).toLowerCase(),
  contains: (a, b) => String(a).toLowerCase().includes(String(b).toLowerCase()),
  in: (a, b) => (Array.isArray(b) ? b : [b]).some((v) => String(v).toLowerCase() === String(a).toLowerCase()),
  gt: (a, b) => Number(a) > Number(b),
  gte: (a, b) => Number(a) >= Number(b),
  lt: (a, b) => Number(a) < Number(b),
  lte: (a, b) => Number(a) <= Number(b)
};

// filter: array of { field, op, value }. sort: { field, direction }. Plain rows in, plain rows out.
export async function querySource(id, { filter = [], sort = null, limit = 200, offset = 0 } = {}) {
  const resolved = resolveSourceId(id);
  const source = SOURCES[resolved];
  id = resolved;
  if (!source) throw new Error(`Unknown data source '${id}'. Known sources: ${Object.keys(SOURCES).join(", ")}.`);
  let rows = await source.rows();
  const clauses = Array.isArray(filter) ? filter : [];
  for (const clause of clauses) {
    const test = OPERATORS[clause.op || "eq"];
    if (!test || typeof clause.field !== "string") throw new Error(`Bad filter on '${clause.field}'.`);
    rows = rows.filter((row) => row[clause.field] !== undefined && test(row[clause.field], clause.value));
  }
  const total = rows.length;
  if (sort && typeof sort.field === "string") {
    const direction = sort.direction === "desc" ? -1 : 1;
    rows = [...rows].sort((a, b) => (a[sort.field] > b[sort.field] ? direction : a[sort.field] < b[sort.field] ? -direction : 0));
  }
  const max = Math.min(Math.max(Number(limit) || 200, 1), 20000);
  rows = rows.slice(Math.max(Number(offset) || 0, 0), Math.max(Number(offset) || 0, 0) + max);
  return { source: id, label: source.label, description: source.description, total, count: rows.length, rows };
}
