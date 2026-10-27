import {
  DeliveryStorage,
  getDeliveryStorage,
  type DeliveryRecord,
} from "../storage/delivery.storage.ts";
import {
  RepaymentStorage,
  getRepaymentStorage,
  type SupplierRepaymentDebt,
  type RepaymentStatus,
} from "../storage/repayment.storage.ts";

export class SingleRefundViolationError extends Error {
  readonly captureId: string;
  readonly existingRefundId?: string;
  readonly disputeId?: string;

  constructor(
    captureId: string,
    message: string,
    existingRefundId?: string,
    disputeId?: string
  ) {
    super(`[SingleRefundViolation]: Capture '${captureId}' cannot be refunded. ${message}`);
    this.name = "SingleRefundViolationError";
    this.captureId = captureId;
    this.existingRefundId = existingRefundId;
    this.disputeId = disputeId;
  }
}

export class InspectionWindowActiveError extends Error {
  readonly clanId: string;
  readonly memberId: string;
  readonly inspectionWindowEndsAt: string;

  constructor(clanId: string, memberId: string, inspectionWindowEndsAt: string) {
    super(
      `[InspectionWindowActive]: 48-hour inspection clock is still active until ${inspectionWindowEndsAt} for member ${memberId}. In-app damage claims must be used rather than late dispute forwarding.`
    );
    this.name = "InspectionWindowActiveError";
    this.clanId = clanId;
    this.memberId = memberId;
    this.inspectionWindowEndsAt = inspectionWindowEndsAt;
  }
}

export interface ExistingRefund {
  id?: string;
  refundId?: string;
  captureId?: string;
  disputeId?: string;
  amount?: number;
  source?: "PAYPAL_DISPUTE" | "IN_APP" | "PAYPAL" | string;
  type?: "DISPUTE_REFUND" | "IN_APP_REFUND" | string;
  isDisputeRefund?: boolean;
  status?: string;
  createdAt?: string;
  [key: string]: unknown;
}

export interface ForwardLateDisputeParams {
  clanId: string;
  memberId: string;
  captureId: string;
  disputeId?: string;
  claimedAmount: number;
  reason: string;
  evidenceNotes?: string;
  buyerAgentNotes?: string;
  asOfDate?: Date | string;
  allowActiveWindow?: boolean;
}

export interface LateDisputeForwardingResult {
  forwardingId: string;
  clanId: string;
  memberId: string;
  captureId: string;
  disputeId: string;
  isLate: boolean;
  inspectionWindowEndsAt: string | null;
  forwardedAt: string;
  personalAgentAssistanceNotes: string;
  status: "FORWARDED_TO_PAYPAL" | "INSPECTION_WINDOW_ACTIVE";
  recommendedAction: string;
}

export interface ProcessDisputeResolutionParams {
  disputeId: string;
  clanId: string;
  memberId: string;
  captureId: string;
  supplierEmail: string;
  disputeAmount: number;
  resolution: "BUYER_FAVORED" | "SELLER_FAVORED";
  payoutAlreadySettled: boolean;
  reason?: string;
  debtId?: string;
}

export interface DisputeResolutionResult {
  disputeId: string;
  resolution: "BUYER_FAVORED" | "SELLER_FAVORED";
  payoutAlreadySettled: boolean;
  debtCreated: boolean;
  debtRecord: SupplierRepaymentDebt | null;
  message: string;
}

export function buildBuyerAgentAssistanceNotes(params: {
  clanId: string;
  memberId: string;
  captureId: string;
  disputeId: string;
  claimedAmount: number;
  reason: string;
  inspectionWindowEndsAt: string | null;
  evidenceNotes?: string;
  buyerAgentNotes?: string;
}): string {
  const sections: string[] = [
    `=== SyndicatePay Personal Buyer Agent Assistance Brief ===`,
    `Dispute ID: ${params.disputeId}`,
    `Clan ID: ${params.clanId} | Member: ${params.memberId}`,
    `Payment Capture Reference: ${params.captureId}`,
    `Disputed Claim Amount: $${params.claimedAmount.toFixed(2)} USD`,
    `\n[Inspection Window Status]`,
    params.inspectionWindowEndsAt
      ? `The standard 48-hour inspection clock expired at ${params.inspectionWindowEndsAt}. In-app damage claims are no longer eligible; this claim is formally forwarded to PayPal Mediation.`
      : `Delivery confirmation inspection window unrecorded or pending.`,
    `\n[Claim Summary & Reason]`,
    `${params.reason}`,
    params.evidenceNotes
      ? `Evidence Notes: ${params.evidenceNotes}`
      : `Evidence Notes: Photographic and transit logs available in member dispute packet.`,
    params.buyerAgentNotes
      ? `Personal Agent Remarks: ${params.buyerAgentNotes}`
      : `Personal Agent Remarks: Automated dispute assistance active. Escort member through PayPal Mediation.`,
    `\n[External Supplier Agreement (ADR-0012)]`,
    `Under the SyndicatePay External Supplier Agreement, wholesale suppliers agree that any post-settlement PayPal dispute ruling in buyer's favor constitutes an immediate, legally enforceable debt repayment obligation to SyndicatePay escrow.`,
    `============================================================`,
  ];
  return sections.join("\n");
}

/**
 * Asserts that a capture can receive an in-app refund.
 * If a PayPal dispute refund already exists for this capture,
 * strictly blocks issuing a second in-app refund under the Single-Refund Invariant.
 */
export function assertCanRefund(
  captureId: string,
  proposedRefundAmount: number,
  existingRefunds: ExistingRefund[] = []
): void {
  if (proposedRefundAmount <= 0) {
    throw new Error("Proposed refund amount must be greater than zero.");
  }

  for (const ref of existingRefunds) {
    if (ref.captureId && ref.captureId !== captureId) {
      continue;
    }

    const isDisputeRefund =
      ref.isDisputeRefund === true ||
      ref.source === "PAYPAL_DISPUTE" ||
      ref.source === "paypal_dispute" ||
      ref.source === "PAYPAL" ||
      ref.type === "DISPUTE_REFUND" ||
      ref.type === "dispute_refund" ||
      Boolean(ref.disputeId);

    if (isDisputeRefund) {
      throw new SingleRefundViolationError(
        captureId,
        `A PayPal dispute refund (${ref.refundId || ref.id || ref.disputeId || "DISPUTE_REFUND"}) already exists for this capture. An accepted PayPal dispute refund strictly blocks issuing a second in-app refund under the single-refund invariant.`,
        ref.refundId || ref.id,
        ref.disputeId
      );
    }
  }
}

export class LateDisputeAdapter {
  private deliveryStorage: DeliveryStorage;
  private repaymentStorage: RepaymentStorage;

  constructor(
    customDeliveryStorage?: DeliveryStorage,
    customRepaymentStorage?: RepaymentStorage
  ) {
    this.deliveryStorage = customDeliveryStorage || getDeliveryStorage();
    this.repaymentStorage = customRepaymentStorage || getRepaymentStorage();
  }

  /**
   * Detects whether a claim for a given member is late.
   * Compares the evaluation time (asOfDate) against the recorded inspectionWindowEndsAt.
   * If current time > inspectionWindowEndsAt, returns true.
   */
  public isLateDispute(
    clanId: string,
    memberId: string,
    asOfDate: Date | string = new Date()
  ): boolean {
    const record = this.deliveryStorage.getByMember(clanId, memberId);
    if (!record || !record.inspectionWindowEndsAt) {
      return false;
    }
    const windowEndMs = new Date(record.inspectionWindowEndsAt).getTime();
    const checkTimeMs =
      typeof asOfDate === "string" ? new Date(asOfDate).getTime() : asOfDate.getTime();
    return checkTimeMs > windowEndMs;
  }

  /**
   * Evaluates dispute timing details with explanatory message.
   */
  public evaluateDisputeTiming(
    clanId: string,
    memberId: string,
    asOfDate: Date | string = new Date()
  ): { isLate: boolean; inspectionWindowEndsAt: string | null; reason: string } {
    const record = this.deliveryStorage.getByMember(clanId, memberId);
    if (!record || !record.inspectionWindowEndsAt) {
      return {
        isLate: false,
        inspectionWindowEndsAt: null,
        reason: "No finalized inspection window recorded for this member delivery.",
      };
    }

    const isLate = this.isLateDispute(clanId, memberId, asOfDate);
    return {
      isLate,
      inspectionWindowEndsAt: record.inspectionWindowEndsAt,
      reason: isLate
        ? `Evaluation time is past 48-hour inspection window (${record.inspectionWindowEndsAt}). Dispute must be handled as a late dispute.`
        : `48-hour inspection window is still active (${record.inspectionWindowEndsAt}). In-app claims are permitted.`,
    };
  }

  /**
   * Forwards late dispute to PayPal with personal agent assistance notes for the buyer.
   * Enforces that the 48-hour inspection clock has expired unless explicitly permitted.
   */
  public forwardLateDispute(params: ForwardLateDisputeParams): LateDisputeForwardingResult {
    const deliveryRecord = this.deliveryStorage.getByMember(params.clanId, params.memberId);
    const windowEndsAt = deliveryRecord ? deliveryRecord.inspectionWindowEndsAt : null;
    const isLate = this.isLateDispute(params.clanId, params.memberId, params.asOfDate);

    if (!isLate && !params.allowActiveWindow) {
      throw new InspectionWindowActiveError(
        params.clanId,
        params.memberId,
        windowEndsAt || "ACTIVE_OR_UNCONFIRMED"
      );
    }

    const disputeId =
      params.disputeId || `PP-D-${Date.now().toString().slice(-8)}`;
    const forwardingId = `fwd-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const forwardedAt = new Date().toISOString();

    const notes = buildBuyerAgentAssistanceNotes({
      clanId: params.clanId,
      memberId: params.memberId,
      captureId: params.captureId,
      disputeId,
      claimedAmount: params.claimedAmount,
      reason: params.reason,
      inspectionWindowEndsAt: windowEndsAt,
      evidenceNotes: params.evidenceNotes,
      buyerAgentNotes: params.buyerAgentNotes,
    });

    return {
      forwardingId,
      clanId: params.clanId,
      memberId: params.memberId,
      captureId: params.captureId,
      disputeId,
      isLate,
      inspectionWindowEndsAt: windowEndsAt,
      forwardedAt,
      personalAgentAssistanceNotes: notes,
      status: isLate ? "FORWARDED_TO_PAYPAL" : "INSPECTION_WINDOW_ACTIVE",
      recommendedAction: isLate
        ? "Submit formal claim to PayPal Resolution Center with attached buyer agent brief."
        : "Direct buyer to standard in-app damage claim flow.",
    };
  }

  /**
   * Settlement / Webhook Resolution Handling:
   * - If resolution === "BUYER_FAVORED" and payoutAlreadySettled === true:
   *   Creates a SupplierRepaymentDebt record in RepaymentStorage for the debt owed by the supplier
   *   under the external supplier agreement.
   * - If payoutAlreadySettled === false:
   *   No repayment debt needed (settled from held escrow balance).
   * - If resolution === "SELLER_FAVORED":
   *   No repayment debt needed.
   */
  public processDisputeResolution(
    params: ProcessDisputeResolutionParams
  ): DisputeResolutionResult {
    if (params.resolution === "BUYER_FAVORED") {
      if (params.payoutAlreadySettled) {
        const nowIso = new Date().toISOString();
        const debtId =
          params.debtId || `debt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

        const debtRecord: SupplierRepaymentDebt = {
          id: debtId,
          clanId: params.clanId,
          memberId: params.memberId,
          disputeId: params.disputeId,
          captureId: params.captureId,
          supplierEmail: params.supplierEmail,
          disputeAmount: params.disputeAmount,
          debtAmount: params.disputeAmount,
          reason:
            params.reason ||
            `PayPal dispute ${params.disputeId} resolved BUYER_FAVORED post-payout. Supplier repayment obligation recorded under external supplier agreement.`,
          status: "OUTSTANDING",
          repaidAmount: 0,
          createdAt: nowIso,
          updatedAt: nowIso,
        };

        this.repaymentStorage.create(debtRecord);

        return {
          disputeId: params.disputeId,
          resolution: "BUYER_FAVORED",
          payoutAlreadySettled: true,
          debtCreated: true,
          debtRecord,
          message: `Recorded supplier repayment debt of $${params.disputeAmount.toFixed(2)} USD for supplier ${params.supplierEmail} under external supplier agreement.`,
        };
      }

      // Pre-payout: funds deducted from held escrow balance
      return {
        disputeId: params.disputeId,
        resolution: "BUYER_FAVORED",
        payoutAlreadySettled: false,
        debtCreated: false,
        debtRecord: null,
        message: `Dispute resolved in buyer's favor prior to payout settlement. Refund of $${params.disputeAmount.toFixed(2)} USD settled from held escrow balance; no supplier debt created.`,
      };
    }

    // Resolution === "SELLER_FAVORED"
    return {
      disputeId: params.disputeId,
      resolution: "SELLER_FAVORED",
      payoutAlreadySettled: params.payoutAlreadySettled,
      debtCreated: false,
      debtRecord: null,
      message: `Dispute resolved in seller's favor. No refund or supplier repayment debt required.`,
    };
  }

  /**
   * Enforces Single-Refund Invariant on instance:
   * If a PayPal dispute refund already exists for this capture, strictly blocks issuing a second in-app refund.
   */
  public assertCanRefund(
    captureId: string,
    proposedRefundAmount: number,
    existingRefunds: ExistingRefund[] = []
  ): void {
    assertCanRefund(captureId, proposedRefundAmount, existingRefunds);
  }
}

let defaultLateDisputeAdapter: LateDisputeAdapter | null = null;

export function getLateDisputeAdapter(): LateDisputeAdapter {
  if (!defaultLateDisputeAdapter) {
    defaultLateDisputeAdapter = new LateDisputeAdapter();
  }
  return defaultLateDisputeAdapter;
}
