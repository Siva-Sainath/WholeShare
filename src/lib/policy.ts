/**
 * Wholeshare TypeScript Policy Sandwich & Deterministic Invariant Verifier
 * 
 * Enforces FinTech and commercial invariants:
 * - Integer-cents arithmetic
 * - Soft authorization holds (Orders v2 intent: "AUTHORIZE")
 * - Replay protection & idempotency
 * - Buyer spend caps & platform ceilings ($1,000 / $5,000 KYC step-up)
 * - Pro-rata coalition financial balancing
 * - Coalition state machine transitions
 */

export interface Allocation {
  buyerId: string;
  units: number;
  amountCents: number;
  stepUpRequired?: boolean;
}

export interface Proposal {
  coalitionId: string;
  sku: string;
  totalUnits: number;
  unitPriceCents: number;
  allocations: Allocation[];
  intent: "AUTHORIZE" | "CAPTURE";
  idempotencyKey: string;
}

export interface BuyerMandate {
  maxSpendCents: number;
  stepUpThresholdCents: number;
}

export interface PolicyContext {
  catalogPriceCents: number;
  mandates?: Map<string, BuyerMandate>;
  platformCeilingCents?: number;
}

export interface PolicyEvaluation {
  valid: boolean;
  invariantsPassed: string[];
  violations: string[];
  evaluatedAt: string;
  normalizedProposal?: Proposal;
}

export const PLATFORM_STEP_UP_CEILING_CENTS = 500000; // $5,000 KYC ceiling
export const STEP_UP_THRESHOLD_CENTS = 100000;         // $1,000 soft hold step-up trigger

export const VALID_COALITION_STATE_TRANSITIONS: Record<string, string[]> = {
  EMPTY: ["FORMING"],
  FORMING: ["FORMING", "LOCKED", "AWAITING_STEP_UP", "FAILED"],
  AWAITING_STEP_UP: ["FORMING", "LOCKED", "FAILED"],
  LOCKED: ["CAPTURED", "CANCELLED", "REFUNDED", "FAILED"],
  CAPTURED: ["SETTLED", "DISPUTED"],
  SETTLED: [],
  DISPUTED: ["MEDIATED", "REFUNDED"],
  MEDIATED: ["SETTLED"],
  REFUNDED: [],
  FAILED: []
};

/**
 * Validates a negotiation proposal against the mathematical policy sandwich.
 */
export function verifyFinancialPolicy(proposal: any, context: PolicyContext): PolicyEvaluation {
  const violations: string[] = [];
  const invariantsPassed: string[] = [];
  const evaluatedAt = new Date().toISOString();

  if (!proposal || typeof proposal !== "object") {
    return {
      valid: false,
      invariantsPassed: [],
      violations: ["Proposal must be a valid non-null object."],
      evaluatedAt
    };
  }

  const {
    coalitionId,
    sku,
    totalUnits,
    unitPriceCents,
    allocations,
    intent,
    idempotencyKey
  } = proposal;

  const catalogPriceCents = context.catalogPriceCents;
  const mandates = context.mandates || new Map();
  const ceiling = context.platformCeilingCents || PLATFORM_STEP_UP_CEILING_CENTS;

  // Invariant 1: Integer arithmetic
  const integersValid =
    Number.isInteger(totalUnits) && totalUnits > 0 &&
    Number.isInteger(unitPriceCents) && unitPriceCents > 0 &&
    Array.isArray(allocations) && allocations.length > 0 &&
    allocations.every(a => Number.isInteger(a.units) && a.units > 0 && Number.isInteger(a.amountCents) && a.amountCents > 0);

  if (integersValid) {
    invariantsPassed.push("INVARIANT_1_INTEGER_ARITHMETIC");
  } else {
    violations.push("All unit and currency figures must be positive integers.");
  }

  // Invariant 8: Soft authorization intent
  if (intent === "AUTHORIZE") {
    invariantsPassed.push("INVARIANT_8_SOFT_AUTHORIZATION_INTENT");
  } else {
    violations.push("Financial intent must strictly be 'AUTHORIZE'. Direct CAPTURE is prohibited.");
  }

  // Invariant 10: Replay protection
  if (typeof idempotencyKey === "string" && idempotencyKey.trim().length >= 8) {
    invariantsPassed.push("INVARIANT_10_REPLAY_PROTECTION");
  } else {
    violations.push("Valid idempotency key with minimum 8 characters is required.");
  }

  // Invariant 7: Discount floor
  if (Number.isInteger(catalogPriceCents) && unitPriceCents <= catalogPriceCents) {
    invariantsPassed.push("INVARIANT_7_DISCOUNT_FLOOR");
  } else {
    violations.push(`Unit price ${unitPriceCents} cents exceeds catalog price ${catalogPriceCents} cents.`);
  }

  if (!Array.isArray(allocations) || allocations.length === 0) {
    return {
      valid: false,
      invariantsPassed,
      violations,
      evaluatedAt
    };
  }

  // Invariant 9: Single allocation per buyer
  const buyerIds = allocations.map(a => a.buyerId);
  const uniqueBuyerIds = new Set(buyerIds);
  if (uniqueBuyerIds.size === buyerIds.length) {
    invariantsPassed.push("INVARIANT_9_SINGLE_ALLOCATION_PER_BUYER");
  } else {
    violations.push("Duplicate buyer allocations detected in coalition proposal.");
  }

  // Invariant 5: Exact allocation sum
  const sumUnits = allocations.reduce((acc, a) => acc + (a.units || 0), 0);
  if (sumUnits === totalUnits) {
    invariantsPassed.push("INVARIANT_5_EXACT_ALLOCATION_SUM");
  } else {
    violations.push(`Sum of allocated units (${sumUnits}) does not equal total coalition units (${totalUnits}).`);
  }

  // Invariant 6: Exact financial balancing
  const expectedTotalCents = totalUnits * unitPriceCents;
  const sumAllocatedCents = allocations.reduce((acc, a) => acc + (a.amountCents || 0), 0);
  if (sumAllocatedCents === expectedTotalCents) {
    invariantsPassed.push("INVARIANT_6_EXACT_FINANCIAL_BALANCING");
  } else {
    violations.push(`Allocated cents sum (${sumAllocatedCents}) does not balance total expected cents (${expectedTotalCents}).`);
  }

  // Invariants 2, 3, 4: Spend caps and step-up KYC verification
  let spendCapsRespected = true;
  let stepUpCorrect = true;

  const normalizedAllocations = allocations.map(alloc => {
    const mandate = mandates.get(alloc.buyerId);
    const buyerMax = mandate ? mandate.maxSpendCents : Infinity;
    const buyerThreshold = mandate ? mandate.stepUpThresholdCents : STEP_UP_THRESHOLD_CENTS;

    if (alloc.amountCents > buyerMax) {
      spendCapsRespected = false;
      violations.push(`Buyer ${alloc.buyerId} allocation of ${alloc.amountCents} cents exceeds mandate cap of ${buyerMax} cents.`);
    }

    const requiresStepUp = alloc.amountCents > buyerThreshold || alloc.amountCents > ceiling;
    if (requiresStepUp && !alloc.stepUpRequired) {
      stepUpCorrect = false;
      violations.push(`Buyer ${alloc.buyerId} amount of ${alloc.amountCents} cents exceeds threshold without step-up flag.`);
    }

    return {
      ...alloc,
      stepUpRequired: requiresStepUp
    };
  });

  if (spendCapsRespected) {
    invariantsPassed.push("INVARIANT_2_HARD_SPEND_CAP");
  }

  if (stepUpCorrect) {
    invariantsPassed.push("INVARIANT_3_GLOBAL_PLATFORM_CEILING");
    invariantsPassed.push("INVARIANT_4_BUYER_MANDATE_STEP_UP");
  }

  const valid = violations.length === 0;

  return {
    valid,
    invariantsPassed,
    violations,
    evaluatedAt,
    normalizedProposal: valid ? {
      ...proposal,
      allocations: normalizedAllocations
    } : undefined
  };
}

/**
 * Validates state transitions in the coalition lifecycle.
 */
export function verifyStateTransition(currentState: string, targetState: string): { valid: boolean; error?: string } {
  const allowed = VALID_COALITION_STATE_TRANSITIONS[currentState] || [];
  if (!allowed.includes(targetState)) {
    return {
      valid: false,
      error: `Illegal state transition from ${currentState} to ${targetState}. Allowed transitions: [${allowed.join(", ")}].`
    };
  }
  return { valid: true };
}

/**
 * Validates tool call arguments at the platform boundary.
 */
export function verifyToolBoundary(toolName: string, args: Record<string, any> = {}): { valid: boolean; violations: string[] } {
  const violations: string[] = [];

  if (toolName === "create_order") {
    if (args.intent && args.intent !== "AUTHORIZE") {
      violations.push("Financial intent must strictly be 'AUTHORIZE'. Direct CAPTURE is prohibited.");
    }
    if (args.amountCents !== undefined && (!Number.isInteger(args.amountCents) || args.amountCents <= 0)) {
      violations.push("Amount in cents must be a positive integer.");
    }
  }

  if (toolName === "join_syndicate") {
    if (args.units !== undefined && (!Number.isInteger(args.units) || args.units <= 0)) {
      violations.push("Syndicate units must be a positive integer.");
    }
  }

  if (toolName === "generate_step_up_invoice" || toolName === "generate_invoice_qr_code") {
    const amount = args.amountCents || args.totalCents;
    if (amount !== undefined && (!Number.isInteger(amount) || amount <= 0)) {
      violations.push("Invoice amount must be a positive integer in cents.");
    }
  }

  if (toolName === "spawn_sme_mandate") {
    if (args.pledgedUnits !== undefined && (!Number.isInteger(args.pledgedUnits) || args.pledgedUnits <= 0)) {
      violations.push("Pledged units must be a positive integer.");
    }
    if (args.maxAutoAuthorizeUsd !== undefined && (typeof args.maxAutoAuthorizeUsd !== "number" || args.maxAutoAuthorizeUsd <= 0)) {
      violations.push("Spend cap must be a positive number.");
    }
  }

  if (toolName === "capture_order_hold") {
    if (args.amountCents !== undefined && (!Number.isInteger(args.amountCents) || args.amountCents <= 0)) {
      violations.push("Capture amount in cents must be a positive integer.");
    }
    if (!args.authorizationId || typeof args.authorizationId !== "string" || !args.authorizationId.trim()) {
      violations.push("Authorization identifier is required for capture.");
    }
  }

  if (toolName === "authorize_paypal_escrow") {
    if (!args.coalitionId || typeof args.coalitionId !== "string" || !args.coalitionId.trim()) {
      violations.push("coalitionId is required to lock escrow.");
    }
  }

  return {
    valid: violations.length === 0,
    violations
  };
}
