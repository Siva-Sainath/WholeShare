import { getClanById, saveClan } from "./clanStore.ts";
import type { ClanCandidate, MatchVector } from "./types.ts";

export type EscrowState =
  | "FORMING"
  | "MOQ_REACHED"
  | "PAYPAL_AUTH_LOCKED"
  | "IN_TRANSIT"
  | "DISPUTE_OPEN"
  | "SETTLED";

export const ESCROW_TRANSITIONS: Record<EscrowState, EscrowState[]> = {
  FORMING: ["MOQ_REACHED"],
  MOQ_REACHED: ["PAYPAL_AUTH_LOCKED", "FORMING"],
  PAYPAL_AUTH_LOCKED: ["IN_TRANSIT"],
  IN_TRANSIT: ["DISPUTE_OPEN", "SETTLED"],
  DISPUTE_OPEN: ["SETTLED"],
  SETTLED: []
};

export interface ClanEscrowRecord {
  clanId: string;
  state: EscrowState;
  members: {
    buyerId: string;
    smeName: string;
    pledgedUnits: number;
    authorizedCents: number;
    currency: string;
    stepUpRequired: boolean;
    paypalOrderId?: string;
    joinedAt: string;
  }[];
  totalUnits: number;
  targetUnits: number;
  effectiveUnitPriceCents: number;
  trackingNumber?: string;
  carrier?: string;
  disputeReason?: string;
  history: {
    from: EscrowState;
    to: EscrowState;
    timestamp: string;
    reason: string;
  }[];
}

const escrowRecords = new Map<string, ClanEscrowRecord>();

export function getEscrowRecord(clanId: string): ClanEscrowRecord | null {
  return escrowRecords.get(clanId) || null;
}

export function canTransitionEscrow(from: EscrowState, to: EscrowState): boolean {
  const allowed = ESCROW_TRANSITIONS[from];
  return Boolean(allowed && allowed.includes(to));
}

export function joinClanWithEscrow(
  clanId: string,
  matchVector: MatchVector,
  paypalOrderId?: string
): { clan: ClanCandidate; escrow: ClanEscrowRecord } {
  const clan = getClanById(clanId);
  if (!clan) {
    throw new Error(`Clan not found with ID: ${clanId}`);
  }

  let record = escrowRecords.get(clanId);
  if (!record) {
    record = {
      clanId,
      state: clan.status as EscrowState,
      members: [],
      totalUnits: clan.currentUnits,
      targetUnits: clan.targetUnits,
      effectiveUnitPriceCents: clan.baseUnitPriceCents,
      history: []
    };
    escrowRecords.set(clanId, record);
  }

  const newTotalUnits = clan.currentUnits + matchVector.quantityRequested;

  let bestDiscountPct = 0;
  for (const tier of clan.discountTiers) {
    if (newTotalUnits >= tier.minUnits && tier.discountPct > bestDiscountPct) {
      bestDiscountPct = tier.discountPct;
    }
  }

  const unitPrice = Math.round(
    (clan.baseUnitPriceCents * (100 - bestDiscountPct)) / 100
  );
  const pledgeTotalCents = unitPrice * matchVector.quantityRequested;
  const stepUpRequired = pledgeTotalCents >= 100000;

  const buyerId = `buyer-${matchVector.smeName.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 16)}`;
  record.members.push({
    buyerId,
    smeName: matchVector.smeName,
    pledgedUnits: matchVector.quantityRequested,
    authorizedCents: pledgeTotalCents,
    currency: clan.settlementCurrency,
    stepUpRequired,
    paypalOrderId,
    joinedAt: new Date().toISOString()
  });

  record.totalUnits = newTotalUnits;
  record.effectiveUnitPriceCents = unitPrice;
  clan.currentUnits = newTotalUnits;
  clan.memberCount += 1;

  if (newTotalUnits >= clan.targetUnits && record.state === "FORMING") {
    transitionEscrowState(clanId, "MOQ_REACHED", "Pledge completed target minimum order quantity");
    clan.status = "MOQ_REACHED";
  }

  saveClan(clan);
  return { clan, escrow: record };
}

export function transitionEscrowState(
  clanId: string,
  targetState: EscrowState,
  reason: string
): ClanEscrowRecord {
  const record = escrowRecords.get(clanId);
  if (!record) {
    throw new Error(`Escrow record not found for clan: ${clanId}`);
  }

  if (!canTransitionEscrow(record.state, targetState)) {
    throw new Error(
      `Illegal escrow transition from ${record.state} to ${targetState}`
    );
  }

  const fromState = record.state;
  record.state = targetState;
  record.history.push({
    from: fromState,
    to: targetState,
    timestamp: new Date().toISOString(),
    reason
  });

  const clan = getClanById(clanId);
  if (clan) {
    clan.status = targetState;
    saveClan(clan);
  }

  return record;
}

export function lockClanEscrow(clanId: string): ClanEscrowRecord {
  return transitionEscrowState(
    clanId,
    "PAYPAL_AUTH_LOCKED",
    "All member authorizations verified via Orders v2 soft holds"
  );
}

export function dispatchShipment(
  clanId: string,
  trackingNumber: string,
  carrier: string
): ClanEscrowRecord {
  const record = transitionEscrowState(
    clanId,
    "IN_TRANSIT",
    `Shipment dispatched with tracking ${trackingNumber} via ${carrier}`
  );
  record.trackingNumber = trackingNumber;
  record.carrier = carrier;
  return record;
}

export function openCustomerDispute(
  clanId: string,
  disputeReason: string
): ClanEscrowRecord {
  const record = transitionEscrowState(
    clanId,
    "DISPUTE_OPEN",
    `APIMatic customer dispute opened: ${disputeReason}`
  );
  record.disputeReason = disputeReason;
  return record;
}

export function settleEscrow(
  clanId: string,
  resolutionOutcome: "FULL_CAPTURE" | "PRO_RATA_CLAIM_SETTLED"
): ClanEscrowRecord {
  return transitionEscrowState(
    clanId,
    "SETTLED",
    `Escrow finalized with resolution outcome: ${resolutionOutcome}`
  );
}

