import { getDeliveryStorage } from "../storage/delivery.storage.ts";
import { getClaimsStorage } from "../storage/claims.storage.ts";

// The sample business, Neon Dumpling Co., keeps a full set of orders in motion and a short claims history so that every
// timeline, calendar, board and grid has real content for a visitor. These are sample records for the demo business. They carry no PayPal ids.
// Run at boot. It adds what is missing and never overwrites a record the visitor has changed.

const OWNER = "sme_austin_01";
const DAY = 86400000;

const shipment = (id, clanId, tracking, carrier, product, quantity, status, extra) => ({
  id: `del-${id}-${OWNER}`, clanId, memberId: OWNER, trackingNumber: tracking, carrierName: carrier, product, quantity, status,
  source: "supplier", buyerDeliveredAt: null, inspectionWindowEndsAt: null, ...extra
});

function samples(now) {
  const iso = (days) => new Date(now + days * DAY).toISOString();
  return [
    shipment("clan-nyc-cups", "clan-nyc-cups", "1ZV4R8A90365110944", "UPS", "Clear PET Cup 16 oz with Dome Lid (case of 1,000)", 10, "IN_TRANSIT", {
      conditionNotes: "Shipment dispatched; in transit with carrier.", rolling: "IN_TRANSIT", createdAt: iso(-3), shipDate: iso(-2), supplierDeliveredAt: iso(-2), expectedDeliveryAt: iso(2)
    }),
    shipment("clan-nyc-gloves", "clan-nyc-gloves", "1ZV4R8A90365110958", "FedEx", "Nitrile Gloves Powder Free Large (case of 1,000)", 4, "DELAYED", {
      conditionNotes: "Held at the carrier hub. The linehaul was rescheduled.", createdAt: iso(-8), shipDate: iso(-6), supplierDeliveredAt: iso(-6), expectedDeliveryAt: iso(-2)
    }),
    shipment("clan-nyc-rice", "clan-nyc-rice", "1ZV4R8A90365110962", "UPS", "Jasmine Rice 25 lb Bag", 20, "DELIVERED", {
      conditionNotes: "Delivered. A few bags had torn corners.", createdAt: iso(-9), shipDate: iso(-8), supplierDeliveredAt: iso(-6), expectedDeliveryAt: iso(-6),
      buyerDeliveredAt: iso(-6), inspectionWindowEndsAt: iso(-4)
    })
  ];
}

function claims(now) {
  const iso = (days) => new Date(now + days * DAY).toISOString();
  const base = { memberId: OWNER, orderId: "", captureId: "", agreedRefundAmount: null, refundId: null, refundTransaction: null, reducedSupplierPayout: null };
  return [
    {
      ...base, claimId: "claim-sample-rice-torn", clanId: "clan-nyc-rice", damagedUnits: 3, unitPrice: 24.5, orderValue: 490, claimedAmount: 73.5,
      evidence: { photoUrls: ["/demo-kits/photos/damaged-parcel-torn.jpg"], description: "3 of the 20 jasmine rice bags arrived with torn corners." },
      status: "SETTLED", buyerApprovedAt: iso(-5.5), createdAt: iso(-5.8), updatedAt: iso(-5),
      supplierResponse: { action: "ACCEPT", notes: "Supplier accepted the claim. Sample history for the demo business, no PayPal refund id.", respondedAt: iso(-5) },
      agreedRefundAmount: 73.5, refundId: "LOCAL-RECORD"
    },
    {
      ...base, claimId: "claim-sample-cups-lids", clanId: "clan-nyc-cups", damagedUnits: 2, unitPrice: 58, orderValue: 580, claimedAmount: 116,
      evidence: { photoUrls: ["/demo-kits/photos/damaged-parcel-crushed.jpg"], description: "2 cases of cups arrived with crushed lids." },
      status: "BUYER_APPROVED", buyerApprovedAt: iso(-1.2), createdAt: iso(-1.4), updatedAt: iso(-1.2), supplierResponse: null
    }
  ];
}

export function ensureStorySamples(now = Date.now()) {
  const deliveries = getDeliveryStorage();
  const known = new Set(deliveries.getAll().map((record) => record.id));
  let added = 0;
  for (const record of samples(now)) {
    if (!known.has(record.id)) { deliveries.upsert(record); added += 1; }
  }
  const claimStore = getClaimsStorage();
  // Claims a visitor filed more than six hours ago are cleared, so the next visitor starts from the sample history.
  claimStore.removeWhere((claim) => !String(claim.claimId).startsWith("claim-sample-") && (Date.parse(claim.createdAt || "") || 0) < now - 6 * 3600 * 1000);
  const have = new Set(claimStore.getAll().map((claim) => claim.claimId));
  for (const claim of claims(now)) {
    if (!have.has(claim.claimId)) { claimStore.create(claim); added += 1; }
  }
  return added;
}
