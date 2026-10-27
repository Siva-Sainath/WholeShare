import { createHash } from "node:crypto";

/**
 * SyndicatePay Domain Money Math and Pure State Machine Rules
 *
 * Pure deterministic functions implementing business rules, mathematical calculations,
 * and state transitions with zero external network or PayPal calls.
 */

// ============================================================================
// 1. Claim Capping
// ============================================================================

/**
 * Pure claim capping function implementing: min(damagedUnits * unitPrice, orderValue)
 * Deterministically limits any buyer claim refund to the lesser of actual damage or total order value.
 */
export function calculateClaimCap(
  damagedUnits: number,
  unitPrice: number,
  orderValue: number
): number {
  if (damagedUnits < 0) {
    throw new Error("Damaged units cannot be negative");
  }
  if (unitPrice < 0) {
    throw new Error("Unit price cannot be negative");
  }
  if (orderValue < 0) {
    throw new Error("Order value cannot be negative");
  }

  const rawDamageAmount = damagedUnits * unitPrice;
  const roundedDamageAmount = Math.round(rawDamageAmount * 100) / 100;
  const roundedOrderValue = Math.round(orderValue * 100) / 100;

  return Math.min(roundedDamageAmount, roundedOrderValue);
}

// ============================================================================
// 2. Pro-Rata Share and Pricing Tier Calculations
// ============================================================================

export interface PricingTier {
  minQuantity: number;
  unitPrice: number;
}

export interface MemberPledge {
  memberId: string;
  quantity: number;
}

export interface MemberShare {
  memberId: string;
  quantity: number;
  unitPrice: number;
  finalAmount: number;
  initialHoldAmount?: number;
  releasedHoldAmount?: number;
}

export interface ClanSettlementSummary {
  totalQuantity: number;
  effectiveTier: PricingTier;
  totalCaptured: number;
  memberShares: MemberShare[];
  grossSupplierPayout: number;
}

/**
 * Determines the effective pricing tier from quantity and available tiers.
 */
export function resolveEffectiveTier(
  totalQuantity: number,
  tiers: PricingTier[]
): PricingTier {
  if (!tiers || tiers.length === 0) {
    throw new Error("Pricing tiers list cannot be empty");
  }
  if (totalQuantity <= 0) {
    throw new Error("Total quantity must be greater than zero");
  }

  const sortedTiers = [...tiers].sort((a, b) => b.minQuantity - a.minQuantity);
  const matched = sortedTiers.find((t) => totalQuantity >= t.minQuantity);

  if (!matched) {
    throw new Error(
      `Total quantity ${totalQuantity} does not meet lowest MOQ tier (${sortedTiers[sortedTiers.length - 1].minQuantity})`
    );
  }

  return matched;
}

/**
 * Calculates a single member's payment share.
 */
export function calculateMemberShare(quantity: number, unitPrice: number): number {
  if (quantity < 0 || unitPrice < 0) {
    throw new Error("Quantity and unit price must be non-negative");
  }
  return Math.round(quantity * unitPrice * 100) / 100;
}

/**
 * Calculates the amount of uncaptured authorization hold released upon final capture.
 */
export function calculateHoldRelease(
  initialHoldAmount: number,
  finalCapturedAmount: number
): number {
  if (initialHoldAmount < finalCapturedAmount) {
    throw new Error("Initial hold cannot be less than final captured amount");
  }
  return Math.round((initialHoldAmount - finalCapturedAmount) * 100) / 100;
}

/**
 * Computes full Clan settlement breakdown across all pledges and pricing tiers.
 */
export function calculateClanSettlement(
  pledges: MemberPledge[],
  tiers: PricingTier[],
  initialHoldUnitPrice?: number
): ClanSettlementSummary {
  if (!pledges || pledges.length === 0) {
    throw new Error("Pledges list cannot be empty");
  }

  const totalQuantity = pledges.reduce((sum, p) => sum + p.quantity, 0);
  const effectiveTier = resolveEffectiveTier(totalQuantity, tiers);

  let totalCaptured = 0;
  const memberShares: MemberShare[] = pledges.map((pledge) => {
    const finalAmount = calculateMemberShare(pledge.quantity, effectiveTier.unitPrice);
    totalCaptured += finalAmount;

    let initialHoldAmount: number | undefined;
    let releasedHoldAmount: number | undefined;

    if (initialHoldUnitPrice !== undefined) {
      initialHoldAmount = calculateMemberShare(pledge.quantity, initialHoldUnitPrice);
      releasedHoldAmount = calculateHoldRelease(initialHoldAmount, finalAmount);
    }

    return {
      memberId: pledge.memberId,
      quantity: pledge.quantity,
      unitPrice: effectiveTier.unitPrice,
      finalAmount,
      initialHoldAmount,
      releasedHoldAmount,
    };
  });

  totalCaptured = Math.round(totalCaptured * 100) / 100;

  return {
    totalQuantity,
    effectiveTier,
    totalCaptured,
    memberShares,
    grossSupplierPayout: totalCaptured,
  };
}

/**
 * Calculates reduced supplier payout after an accepted claim refund deduction.
 */
export function calculateReducedSupplierPayout(
  grossPayout: number,
  refundAmount: number
): number {
  if (grossPayout < 0) {
    throw new Error("Gross payout cannot be negative");
  }
  if (refundAmount < 0) {
    throw new Error("Refund amount cannot be negative");
  }
  if (refundAmount > grossPayout) {
    throw new Error("Refund amount cannot exceed gross supplier payout");
  }
  return Math.round((grossPayout - refundAmount) * 100) / 100;
}

// ============================================================================
// 3. Deterministic Idempotency Key Generator
// ============================================================================

/**
 * Generates a deterministic SHA-256 idempotency key:
 * sha256(operation_type:clan_id:member_id:stage:reference)
 */
export function generateIdempotencyKey(
  operationType: string,
  clanId: string,
  memberId: string,
  stage: string,
  reference: string
): string {
  if (!operationType || !clanId || !stage) {
    throw new Error("operationType, clanId, and stage are required to generate an idempotency key");
  }

  const payload = `${operationType}:${clanId}:${memberId || ""}:${stage}:${reference || ""}`;
  return createHash("sha256").update(payload).digest("hex");
}

// ============================================================================
// 4. Clan & Member State Machines
// ============================================================================

export type ClanState =
  | "FORMING"
  | "THRESHOLD_MET"
  | "LOCKED"
  | "FULFILLING"
  | "SETTLED"
  | "EXPIRED"
  | "CANCELLED";

export const CLAN_TRANSITIONS: Record<ClanState, readonly ClanState[]> = {
  FORMING: ["THRESHOLD_MET", "EXPIRED", "CANCELLED"],
  THRESHOLD_MET: ["LOCKED", "FORMING", "CANCELLED", "EXPIRED"],
  LOCKED: ["FULFILLING", "CANCELLED"],
  FULFILLING: ["SETTLED"],
  SETTLED: [],
  EXPIRED: [],
  CANCELLED: [],
};

export class InvalidClanStateTransitionError extends Error {
  readonly current: ClanState;
  readonly next: ClanState;

  constructor(current: ClanState, next: ClanState) {
    super(`Invalid Clan state transition: cannot transition from '${current}' to '${next}'.`);
    this.name = "InvalidClanStateTransitionError";
    this.current = current;
    this.next = next;
  }
}

export function canTransitionClanState(current: ClanState, next: ClanState): boolean {
  const allowed = CLAN_TRANSITIONS[current];
  return allowed ? allowed.includes(next) : false;
}

export function validateClanStateTransition(current: ClanState, next: ClanState): void {
  if (!canTransitionClanState(current, next)) {
    throw new InvalidClanStateTransitionError(current, next);
  }
}

export function transitionClanState(current: ClanState, next: ClanState): ClanState {
  validateClanStateTransition(current, next);
  return next;
}

export type MemberState =
  | "PLEDGED"
  | "AUTHORIZED"
  | "CAPTURED"
  | "REFUNDED"
  | "VOIDED";

export const MEMBER_TRANSITIONS: Record<MemberState, readonly MemberState[]> = {
  PLEDGED: ["AUTHORIZED", "VOIDED"],
  AUTHORIZED: ["CAPTURED", "VOIDED"],
  CAPTURED: ["REFUNDED"],
  REFUNDED: [],
  VOIDED: [],
};

export class InvalidMemberStateTransitionError extends Error {
  readonly current: MemberState;
  readonly next: MemberState;

  constructor(current: MemberState, next: MemberState) {
    super(`Invalid Member state transition: cannot transition from '${current}' to '${next}'.`);
    this.name = "InvalidMemberStateTransitionError";
    this.current = current;
    this.next = next;
  }
}

export function canTransitionMemberState(current: MemberState, next: MemberState): boolean {
  const allowed = MEMBER_TRANSITIONS[current];
  return allowed ? allowed.includes(next) : false;
}

export function validateMemberStateTransition(current: MemberState, next: MemberState): void {
  if (!canTransitionMemberState(current, next)) {
    throw new InvalidMemberStateTransitionError(current, next);
  }
}

export function transitionMemberState(current: MemberState, next: MemberState): MemberState {
  validateMemberStateTransition(current, next);
  return next;
}
