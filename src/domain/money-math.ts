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

/**
 * Pure claim capping in exact integer cents: min(damagedUnits * unitPriceCents, orderValueCents)
 */
export function calculateClaimCapCents(
  damagedUnits: number,
  unitPriceCents: number,
  orderValueCents: number
): number {
  if (damagedUnits < 0) {
    throw new Error("Damaged units cannot be negative");
  }
  if (unitPriceCents < 0) {
    throw new Error("Unit price cents cannot be negative");
  }
  if (orderValueCents < 0) {
    throw new Error("Order value cents cannot be negative");
  }
  if (!Number.isInteger(damagedUnits)) {
    throw new Error("Damaged units must be an integer");
  }
  if (!Number.isInteger(unitPriceCents)) {
    throw new Error("Unit price cents must be an integer");
  }
  if (!Number.isInteger(orderValueCents)) {
    throw new Error("Order value cents must be an integer");
  }

  const damageCents = damagedUnits * unitPriceCents;
  return Math.min(damageCents, orderValueCents);
}

// ============================================================================
// 2. Pro-Rata Share and Pricing Tier Calculations
// ============================================================================

export interface PricingTier {
  minQuantity: number;
  unitPrice: number;
  unitPriceCents?: number;
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
 * Calculates a single member's payment share in exact integer cents.
 */
export function calculateMemberShareCents(quantity: number, unitPriceCents: number): number {
  if (quantity < 0 || unitPriceCents < 0) {
    throw new Error("Quantity and unit price cents must be non-negative");
  }
  if (!Number.isInteger(quantity) || !Number.isInteger(unitPriceCents)) {
    throw new Error("Quantity and unit price cents must be integers");
  }
  return quantity * unitPriceCents;
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
 * Calculates the amount of uncaptured authorization hold released in exact integer cents.
 */
export function calculateHoldReleaseCents(
  initialHoldCents: number,
  finalCapturedCents: number
): number {
  if (initialHoldCents < finalCapturedCents) {
    throw new Error("Initial hold cents cannot be less than final captured cents");
  }
  return initialHoldCents - finalCapturedCents;
}

/**
 * Converts integer cents to USD number.
 */
export function centsToUsd(cents: number): number {
  return Math.round(cents) / 100;
}

/**
 * Converts USD number to integer cents.
 */
export function usdToCents(usd: number): number {
  return Math.round(usd * 100);
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

/**
 * Calculates reduced supplier payout in exact integer cents.
 */
export function calculateReducedSupplierPayoutCents(
  grossPayoutCents: number,
  refundAmountCents: number
): number {
  if (grossPayoutCents < 0) {
    throw new Error("Gross payout cents cannot be negative");
  }
  if (refundAmountCents < 0) {
    throw new Error("Refund amount cents cannot be negative");
  }
  if (refundAmountCents > grossPayoutCents) {
    throw new Error("Refund cents cannot exceed gross supplier payout cents");
  }
  return grossPayoutCents - refundAmountCents;
}

// ============================================================================
// 3. Deterministic Idempotency Key Generator
// ============================================================================

/**
 * Generates a deterministic SHA-256 idempotency key:
 * sha256(operation_type:clan_id:member_id:stage:reference)
 * Supports both Clan and Coalition identifiers.
 */
export function generateIdempotencyKey(
  operationType: string,
  clanId: string,
  memberId: string,
  stage: string,
  referenceId: string
): string {
  if (!operationType || !clanId || !stage) {
    throw new Error("operationType, clanId, and stage are required to generate an idempotency key");
  }

  const rawKey = `${operationType.toUpperCase()}:${clanId}:${memberId || "GLOBAL"}:${stage.toUpperCase()}:${referenceId || "NONE"}`;
  return createHash("sha256").update(rawKey).digest("hex");
}

// ============================================================================
// 4. Clan & Coalition State Machine Transitions
// ============================================================================

export type ClanState =
  | "FORMING"
  | "THRESHOLD_MET"
  | "AWAITING_STEP_UP"
  | "LOCKED"
  | "FULFILLING"
  | "SETTLED"
  | "CANCELLED"
  | "EXPIRED";

export type CoalitionState = ClanState;

export class InvalidClanStateTransitionError extends Error {
  readonly current: string;
  readonly target: string;

  constructor(current: string, target: string) {
    super(`Illegal Clan state transition from '${current}' to '${target}'.`);
    this.name = "InvalidClanStateTransitionError";
    this.current = current;
    this.target = target;
  }
}

const VALID_CLAN_TRANSITIONS: Record<ClanState, ClanState[]> = {
  FORMING: ["THRESHOLD_MET", "AWAITING_STEP_UP", "LOCKED", "CANCELLED", "EXPIRED"],
  THRESHOLD_MET: ["FORMING", "AWAITING_STEP_UP", "LOCKED", "CANCELLED", "EXPIRED"],
  AWAITING_STEP_UP: ["THRESHOLD_MET", "LOCKED", "CANCELLED", "EXPIRED"],
  LOCKED: ["FULFILLING", "CANCELLED"],
  FULFILLING: ["SETTLED"],
  SETTLED: [],
  CANCELLED: [],
  EXPIRED: [],
};

export function canTransitionClanState(from: ClanState, to: ClanState): boolean {
  const allowed = VALID_CLAN_TRANSITIONS[from];
  return Boolean(allowed && allowed.includes(to));
}

export function validateClanStateTransition(from: ClanState, to: ClanState): void {
  if (!canTransitionClanState(from, to)) {
    throw new InvalidClanStateTransitionError(from, to);
  }
}

export function transitionClanState(from: ClanState, to: ClanState): ClanState {
  validateClanStateTransition(from, to);
  return to;
}

// ============================================================================
// 5. Member State Machine Transitions
// ============================================================================

export type MemberState =
  | "PLEDGED"
  | "AWAITING_STEP_UP"
  | "AUTHORIZED"
  | "CAPTURED"
  | "REFUNDED"
  | "VOIDED";

export class InvalidMemberStateTransitionError extends Error {
  readonly current: string;
  readonly target: string;

  constructor(current: string, target: string) {
    super(`Illegal Member state transition from '${current}' to '${target}'.`);
    this.name = "InvalidMemberStateTransitionError";
    this.current = current;
    this.target = target;
  }
}

const VALID_MEMBER_TRANSITIONS: Record<MemberState, MemberState[]> = {
  PLEDGED: ["AWAITING_STEP_UP", "AUTHORIZED", "VOIDED"],
  AWAITING_STEP_UP: ["AUTHORIZED", "VOIDED"],
  AUTHORIZED: ["CAPTURED", "VOIDED"],
  CAPTURED: ["REFUNDED"],
  REFUNDED: [],
  VOIDED: [],
};

export function canTransitionMemberState(from: MemberState, to: MemberState): boolean {
  const allowed = VALID_MEMBER_TRANSITIONS[from];
  return Boolean(allowed && allowed.includes(to));
}

export function validateMemberStateTransition(from: MemberState, to: MemberState): void {
  if (!canTransitionMemberState(from, to)) {
    throw new InvalidMemberStateTransitionError(from, to);
  }
}

export function transitionMemberState(from: MemberState, to: MemberState): MemberState {
  validateMemberStateTransition(from, to);
  return to;
}
