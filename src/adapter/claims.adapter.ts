import { calculateClaimCap, calculateReducedSupplierPayout } from "../domain/money-math.ts";
import {
  ClaimsStorage,
  getClaimsStorage,
  type DamageClaimRecord,
  type DamageEvidence,
  type SupplierClaimResponse,
} from "../storage/claims.storage.ts";
import { DeliveryStorage, getDeliveryStorage } from "../storage/delivery.storage.ts";

export class InspectionWindowExpiredError extends Error {
  readonly clanId: string;
  readonly memberId: string;
  readonly inspectionWindowEndsAt: string;

  constructor(clanId: string, memberId: string, inspectionWindowEndsAt: string) {
    super(
      `[InspectionWindowExpired]: 48-hour inspection clock expired at ${inspectionWindowEndsAt} for member ${memberId}. In-app damage claims must fall back to formal PayPal dispute.`
    );
    this.name = "InspectionWindowExpiredError";
    this.clanId = clanId;
    this.memberId = memberId;
    this.inspectionWindowEndsAt = inspectionWindowEndsAt;
  }
}

export class BuyerApprovalRequiredError extends Error {
  readonly claimId: string;

  constructor(claimId: string) {
    super(
      `[BuyerApprovalRequired]: Claim '${claimId}' requires explicit buyer approval before supplier can review or respond.`
    );
    this.name = "BuyerApprovalRequiredError";
    this.claimId = claimId;
  }
}

export class ClaimAlreadySettledError extends Error {
  readonly claimId: string;
  readonly refundId: string;

  constructor(claimId: string, refundId: string) {
    super(
      `[SingleRefundViolation]: Claim '${claimId}' has already been settled with refund ID '${refundId}'. Multiple refunds are strictly forbidden.`
    );
    this.name = "ClaimAlreadySettledError";
    this.claimId = claimId;
    this.refundId = refundId;
  }
}

export class InvalidCounterAmountError extends Error {
  readonly counterAmount: number;
  readonly claimedAmount: number;

  constructor(counterAmount: number, claimedAmount: number) {
    super(
      `[InvalidCounterAmount]: Supplier counter-offer of $${counterAmount.toFixed(2)} cannot exceed capped claim amount of $${claimedAmount.toFixed(2)} or be negative.`
    );
    this.name = "InvalidCounterAmountError";
    this.counterAmount = counterAmount;
    this.claimedAmount = claimedAmount;
  }
}

export interface IntakeClaimParams {
  clanId?: string;
  coalitionId?: string;
  memberId?: string;
  smeId?: string;
  orderId: string;
  captureId: string;
  damagedUnits: number;
  unitPrice?: number;
  unitPriceCents?: number;
  orderValue?: number;
  orderValueCents?: number;
  evidence: DamageEvidence;
  autoBuyerApprove?: boolean;
}

export interface SupplierResponseParams {
  claimId: string;
  action: "ACCEPT" | "COUNTER" | "REJECT";
  counterAmount?: number;
  notes?: string;
  executeRefundFn?: (params: {
    clanId: string;
    memberId: string;
    captureId: string;
    amount: number;
    noteToPayer?: string;
  }) => Promise<{ refundId: string; rawResponse?: unknown }>;
}

export class ClaimsAdapter {
  private claimsStorage: ClaimsStorage;
  private deliveryStorage: DeliveryStorage;

  constructor(
    customClaimsStorage?: ClaimsStorage,
    customDeliveryStorage?: DeliveryStorage
  ) {
    this.claimsStorage = customClaimsStorage || getClaimsStorage();
    this.deliveryStorage = customDeliveryStorage || getDeliveryStorage();
  }

  /**
   * Intakes a damage claim:
   * 1. Validates the 48-hour inspection window is not expired.
   * 2. Calculates the deterministic claim cap: min(damagedUnits * unitPrice, orderValue).
   * 3. Creates the claim in DRAFT status (or BUYER_APPROVED if explicitly approved).
   */
  public intakeClaim(params: IntakeClaimParams): DamageClaimRecord {
    if (params.damagedUnits <= 0) {
      throw new Error("Damaged units must be greater than zero");
    }

    const clanId = params.clanId || params.coalitionId || "";
    const memberId = params.memberId || params.smeId || "";
    const unitPrice =
      typeof params.unitPrice === "number"
        ? params.unitPrice
        : typeof params.unitPriceCents === "number"
        ? params.unitPriceCents / 100
        : 0;
    const orderValue =
      typeof params.orderValue === "number"
        ? params.orderValue
        : typeof params.orderValueCents === "number"
        ? params.orderValueCents / 100
        : 0;

    // Verify 48-hour inspection clock
    const deliveryRecord = this.deliveryStorage.getByMember(clanId, memberId);
    if (deliveryRecord && deliveryRecord.inspectionWindowEndsAt) {
      const windowEnd = new Date(deliveryRecord.inspectionWindowEndsAt).getTime();
      const now = Date.now();
      if (now > windowEnd) {
        throw new InspectionWindowExpiredError(
          clanId,
          memberId,
          deliveryRecord.inspectionWindowEndsAt
        );
      }
    }

    const claimedAmount = calculateClaimCap(
      params.damagedUnits,
      unitPrice,
      orderValue
    );

    const nowIso = new Date().toISOString();
    const claimId = `claim-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const isApproved = Boolean(params.autoBuyerApprove);

    const record: DamageClaimRecord = {
      claimId,
      clanId,
      memberId,
      orderId: params.orderId,
      captureId: params.captureId,
      damagedUnits: params.damagedUnits,
      unitPrice,
      orderValue,
      claimedAmount,
      evidence: params.evidence,
      status: isApproved ? "BUYER_APPROVED" : "DRAFT",
      buyerApprovedAt: isApproved ? nowIso : null,
      supplierResponse: null,
      agreedRefundAmount: null,
      refundId: null,
      refundTransaction: null,
      reducedSupplierPayout: null,
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    this.claimsStorage.create(record);
    return record;
  }

  /**
   * Records explicit buyer review and approval before sending the claim to the supplier.
   */
  public approveClaimByBuyer(claimId: string, memberId: string): DamageClaimRecord {
    const claim = this.claimsStorage.getById(claimId);
    if (!claim) {
      throw new Error(`Claim '${claimId}' not found.`);
    }
    if (claim.memberId !== memberId) {
      throw new Error(`Member '${memberId}' is not authorized to approve claim '${claimId}'.`);
    }
    if (claim.status !== "DRAFT") {
      throw new Error(
        `Claim '${claimId}' cannot be approved because status is already '${claim.status}'.`
      );
    }

    claim.status = "BUYER_APPROVED";
    claim.buyerApprovedAt = new Date().toISOString();
    this.claimsStorage.update(claim);
    return claim;
  }

  /**
   * Handles supplier response (ACCEPT, COUNTER, REJECT).
   * Enforces buyer approval gate and single-refund invariant.
   */
  public async respondToClaim(params: SupplierResponseParams): Promise<DamageClaimRecord> {
    const claim = this.claimsStorage.getById(params.claimId);
    if (!claim) {
      throw new Error(`Claim '${params.claimId}' not found.`);
    }

    // Gate: Must be approved by buyer first
    if (claim.status === "DRAFT" || !claim.buyerApprovedAt) {
      throw new BuyerApprovalRequiredError(params.claimId);
    }

    // Single-refund invariant
    if (claim.refundId || claim.status === "SETTLED") {
      throw new ClaimAlreadySettledError(params.claimId, claim.refundId || "UNKNOWN");
    }

    const nowIso = new Date().toISOString();

    if (params.action === "REJECT") {
      claim.status = "REJECTED";
      claim.supplierResponse = {
        action: "REJECT",
        notes: params.notes,
        respondedAt: nowIso,
      };
      this.claimsStorage.update(claim);
      return claim;
    }

    if (params.action === "COUNTER") {
      if (
        params.counterAmount === undefined ||
        params.counterAmount <= 0 ||
        params.counterAmount > claim.claimedAmount
      ) {
        throw new InvalidCounterAmountError(
          params.counterAmount || 0,
          claim.claimedAmount
        );
      }

      claim.status = "SUPPLIER_COUNTERED";
      claim.supplierResponse = {
        action: "COUNTER",
        counterAmount: params.counterAmount,
        notes: params.notes,
        respondedAt: nowIso,
      };
      this.claimsStorage.update(claim);
      return claim;
    }

    // Action === ACCEPT
    const refundAmount = claim.claimedAmount;
    claim.agreedRefundAmount = refundAmount;
    claim.supplierResponse = {
      action: "ACCEPT",
      notes: params.notes,
      respondedAt: nowIso,
    };

    if (params.executeRefundFn) {
      const refundResult = await params.executeRefundFn({
        clanId: claim.clanId,
        memberId: claim.memberId,
        captureId: claim.captureId,
        amount: refundAmount,
        noteToPayer: `SyndicatePay In-App Escrow Refund: ${claim.damagedUnits} Damaged Units`,
      });

      claim.refundId = refundResult.refundId;
      claim.refundTransaction = (refundResult.rawResponse as Record<string, unknown>) || null;
    }

    claim.status = "SETTLED";
    claim.reducedSupplierPayout = calculateReducedSupplierPayout(
      claim.orderValue,
      refundAmount
    );

    this.claimsStorage.update(claim);
    return claim;
  }
}
