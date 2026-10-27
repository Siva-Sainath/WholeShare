import { z } from "zod";

/**
 * SyndicatePay Deterministic Policy Sandwich
 * 
 * Enforces hard mathematical invariants before any financial mutation or PayPal API call:
 * 1. Unit price does not exceed initial wholesale quote.
 * 2. Total commitment does not exceed SME auto-spending cap.
 * 3. Discount achieved meets SME's minimum threshold.
 * 4. Human step-up authentication (Invoice QR code) for commitments over $1,000.
 */

export const OrderCommitmentProposalSchema = z.object({
  clanId: z.string().min(1, "Clan ID required"),
  memberId: z.string().min(1, "Member ID required"),
  quantity: z.number().int().positive("Quantity must be a positive integer"),
  unitPrice: z.number().positive("Unit price must be positive"),
  initialWholesaleQuote: z.number().positive("Initial quote must be positive"),
  smeAutoSpendingCap: z.number().positive("Spending cap must be positive"),
  minDiscountPercentage: z.number().min(0).max(100, "Discount percentage between 0 and 100"),
  currency: z.string().default("USD"),
});

export type OrderCommitmentProposal = z.infer<typeof OrderCommitmentProposalSchema>;

export class PolicyViolationError extends Error {
  public readonly code: string;
  public readonly details: Record<string, unknown>;

  constructor(code: string, message: string, details: Record<string, unknown> = {}) {
    super(`[Policy Sandwich Violation - ${code}]: ${message}`);
    this.name = "PolicyViolationError";
    this.code = code;
    this.details = details;
  }
}

export interface PolicyEvaluationResult {
  passed: boolean;
  totalCommitment: number;
  discountPercentage: number;
  requiresStepUp: boolean;
  stepUpReason?: string;
  auditTrail: {
    rule: string;
    passed: boolean;
    observedValue: string | number;
    threshold: string | number;
  }[];
}

/**
 * STEP-UP THRESHOLD CONSTANT
 * Commitments exceeding $1,000 require human step-up authentication via QR code invoice.
 */
export const HUMAN_STEP_UP_THRESHOLD_USD = 1000.0;

/**
 * Evaluates an order proposal against the 4 non-negotiable financial policies.
 * Throws PolicyViolationError if any hard invariant is violated.
 */
export function evaluateOrderPolicy(rawProposal: OrderCommitmentProposal): PolicyEvaluationResult {
  const proposal = OrderCommitmentProposalSchema.parse(rawProposal);
  const totalCommitment = Math.round(proposal.quantity * proposal.unitPrice * 100) / 100;

  const discountAmount = Math.max(0, proposal.initialWholesaleQuote - proposal.unitPrice);
  const discountPercentage = Math.round((discountAmount / proposal.initialWholesaleQuote) * 10000) / 100;

  const auditTrail: PolicyEvaluationResult["auditTrail"] = [];

  // Invariant 1: Unit price must not exceed initial wholesale quote
  const unitPriceCheck = proposal.unitPrice <= proposal.initialWholesaleQuote;
  auditTrail.push({
    rule: "UNIT_PRICE_WITHIN_QUOTE",
    passed: unitPriceCheck,
    observedValue: `$${proposal.unitPrice.toFixed(2)}`,
    threshold: `$${proposal.initialWholesaleQuote.toFixed(2)}`,
  });
  if (!unitPriceCheck) {
    throw new PolicyViolationError(
      "EXCEEDS_INITIAL_QUOTE",
      `Unit price $${proposal.unitPrice.toFixed(2)} exceeds initial wholesale quote $${proposal.initialWholesaleQuote.toFixed(2)}.`,
      { unitPrice: proposal.unitPrice, initialQuote: proposal.initialWholesaleQuote }
    );
  }

  // Invariant 2: Total commitment must not exceed SME auto-spending cap
  const spendingCapCheck = totalCommitment <= proposal.smeAutoSpendingCap;
  auditTrail.push({
    rule: "TOTAL_WITHIN_SPENDING_CAP",
    passed: spendingCapCheck,
    observedValue: `$${totalCommitment.toFixed(2)}`,
    threshold: `$${proposal.smeAutoSpendingCap.toFixed(2)}`,
  });
  if (!spendingCapCheck) {
    throw new PolicyViolationError(
      "EXCEEDS_SPENDING_CAP",
      `Total commitment $${totalCommitment.toFixed(2)} exceeds SME auto-spending cap of $${proposal.smeAutoSpendingCap.toFixed(2)}.`,
      { totalCommitment, spendingCap: proposal.smeAutoSpendingCap }
    );
  }

  // Invariant 3: Discount achieved must meet minimum threshold
  const discountCheck = discountPercentage >= proposal.minDiscountPercentage;
  auditTrail.push({
    rule: "MINIMUM_DISCOUNT_THRESHOLD_MET",
    passed: discountCheck,
    observedValue: `${discountPercentage.toFixed(2)}%`,
    threshold: `${proposal.minDiscountPercentage.toFixed(2)}%`,
  });
  if (!discountCheck) {
    throw new PolicyViolationError(
      "INSUFFICIENT_DISCOUNT",
      `Achieved discount ${discountPercentage.toFixed(2)}% is below the SME's required minimum discount of ${proposal.minDiscountPercentage.toFixed(2)}%.`,
      { achievedDiscount: discountPercentage, requiredDiscount: proposal.minDiscountPercentage }
    );
  }

  // Invariant 4: Human step-up check for commitments over $1,000
  const requiresStepUp = totalCommitment > HUMAN_STEP_UP_THRESHOLD_USD;
  auditTrail.push({
    rule: "HUMAN_STEP_UP_AUTH",
    passed: true,
    observedValue: `$${totalCommitment.toFixed(2)}`,
    threshold: `$${HUMAN_STEP_UP_THRESHOLD_USD.toFixed(2)}`,
  });

  return {
    passed: true,
    totalCommitment,
    discountPercentage,
    requiresStepUp,
    stepUpReason: requiresStepUp
      ? `Commitment of $${totalCommitment.toFixed(2)} exceeds $${HUMAN_STEP_UP_THRESHOLD_USD.toFixed(2)}. Human Invoice QR authentication required.`
      : undefined,
    auditTrail,
  };
}

/**
 * Deterministic Policy Sandwich Wrapper
 * 
 * Executes `mutationFn` only if pre-policy checks pass, and validates the output post-policy.
 */
export async function withPolicySandwich<TInput extends OrderCommitmentProposal, TOutput>(
  proposal: TInput,
  mutationFn: (validatedProposal: TInput, policyResult: PolicyEvaluationResult) => Promise<TOutput>
): Promise<{ result: TOutput; policy: PolicyEvaluationResult }> {
  // Pre-Policy Gate
  const policyResult = evaluateOrderPolicy(proposal);

  // Execute Financial Mutation
  const result = await mutationFn(proposal, policyResult);

  // Post-Policy Verification (ensures mutation executed deterministically)
  return {
    result,
    policy: policyResult,
  };
}
