import {
  DeliveryStorage,
  getDeliveryStorage,
  type DeliveryRecord,
} from "../storage/delivery.storage.ts";
import {
  ClaimsStorage,
  getClaimsStorage,
  type DamageClaimRecord,
} from "../storage/claims.storage.ts";
import {
  DisputeApprovalStorage,
  getDisputeApprovalStorage,
  type DisputeOfferApproval,
} from "../storage/dispute-approval.storage.ts";

export interface MemberSettlementEvaluation {
  memberId: string;
  orderId: string;
  captureId: string;
  grossCaptured: number;
  acceptedRefunds: number;
  netPayoutShare: number;
  inspectionWindowExpired: boolean;
  hasOpenDispute: boolean;
  isReadyForPayout: boolean;
  holdReason?: string;
}

export interface EvaluateMemberSettlementParams {
  clanId: string;
  memberId: string;
  orderId: string;
  captureId: string;
  grossCaptured: number;
  now?: Date;
  acceptedRefunds?: number;
  hasOpenDispute?: boolean;
}

export interface AccountingSettledMember {
  memberId: string;
  orderId?: string;
  captureId?: string;
  grossCaptured?: number;
  acceptedRefunds?: number;
  netPayoutShare: number;
  [key: string]: unknown;
}

export interface GenerateAccountingWebhookPayloadParams {
  clanId: string;
  supplierEmail: string;
  totalPaid: number;
  settledMembers: AccountingSettledMember[];
  timestamp?: string | Date;
  event?: string;
}

export interface AccountingWebhookPayload {
  event: string;
  eventType: string;
  clanId: string;
  supplierEmail: string;
  currency: string;
  totalPaid: number;
  settledMembersCount: number;
  settledMembers: AccountingSettledMember[];
  timestamp: string;
}

export interface ClanSettlementEvaluation {
  clanId: string;
  evaluations: MemberSettlementEvaluation[];
  totalGrossCaptured: number;
  totalAcceptedRefunds: number;
  totalNetPayout: number;
  allMembersReady: boolean;
  readyMembers: MemberSettlementEvaluation[];
  heldMembers: MemberSettlementEvaluation[];
}

export class SettlementAdapter {
  private deliveryStorage: DeliveryStorage;
  private claimsStorage: ClaimsStorage;
  private disputeApprovalStorage: DisputeApprovalStorage;

  constructor(
    deliveryStorage?: DeliveryStorage,
    claimsStorage?: ClaimsStorage,
    disputeApprovalStorage?: DisputeApprovalStorage
  ) {
    this.deliveryStorage = deliveryStorage || getDeliveryStorage();
    this.claimsStorage = claimsStorage || getClaimsStorage();
    this.disputeApprovalStorage =
      disputeApprovalStorage || getDisputeApprovalStorage();
  }

  /**
   * Evaluates payout readiness and net payout share for a single clan member parcel.
   *
   * Pure domain logic enforcing:
   * 1. 48-hour inspection clock from DeliveryStorage. If now <= inspectionWindowEndsAt, hold reason: "Inspection window still active".
   * 2. Open claims from ClaimsStorage. If open or unapproved claim, hold reason: "Open in-app claim pending".
   * 3. Open dispute from DisputeApprovalStorage or params. If open dispute, hold reason: "Active dispute under review".
   * 4. Hold Rule: A bakery with an active inspection window or an open dispute is STRICTLY NOT paid until resolved.
   * 5. Net payout share calculation: netPayoutShare = grossCaptured - acceptedRefunds.
   * 6. If window expired AND no open claims AND no open disputes: isReadyForPayout: true.
   */
  public evaluateMemberSettlement(
    params: EvaluateMemberSettlementParams
  ): MemberSettlementEvaluation {
    const now = params.now || new Date();

    // 1. Check 48-hour inspection clock from DeliveryStorage
    const deliveryRecord = this.deliveryStorage.getByMember(
      params.clanId,
      params.memberId
    );

    let inspectionWindowExpired = false;
    if (deliveryRecord && deliveryRecord.inspectionWindowEndsAt) {
      const windowEndMs = new Date(
        deliveryRecord.inspectionWindowEndsAt
      ).getTime();
      inspectionWindowExpired = now.getTime() > windowEndMs;
    }

    // 2. Check open claims from ClaimsStorage & compute accepted refunds
    const memberClaims = this.claimsStorage.getByMember(
      params.clanId,
      params.memberId
    );

    const openClaims = memberClaims.filter(
      (c) =>
        c.status === "DRAFT" ||
        c.status === "BUYER_APPROVED" ||
        c.status === "SUPPLIER_COUNTERED"
    );
    const hasOpenClaims = openClaims.length > 0;

    let acceptedRefunds = 0;
    if (params.acceptedRefunds !== undefined) {
      acceptedRefunds = params.acceptedRefunds;
    } else {
      const settledClaims = memberClaims.filter((c) => c.status === "SETTLED");
      acceptedRefunds = settledClaims.reduce((sum, c) => {
        const amount =
          c.agreedRefundAmount !== null && c.agreedRefundAmount !== undefined
            ? c.agreedRefundAmount
            : c.claimedAmount || 0;
        return sum + amount;
      }, 0);
    }
    acceptedRefunds = Math.round(acceptedRefunds * 100) / 100;

    // 3. Check open dispute from DisputeApprovalStorage or params
    let hasOpenDispute = Boolean(params.hasOpenDispute);
    if (!hasOpenDispute && this.disputeApprovalStorage) {
      const memberDisputes = this.disputeApprovalStorage.getAll().filter(
        (d) =>
          (d.clanId === params.clanId && d.memberId === params.memberId) ||
          (Boolean(params.captureId) && d.captureId === params.captureId)
      );

      hasOpenDispute = memberDisputes.some(
        (d) =>
          d.status === "PENDING" ||
          (d.status as string) === "OPEN" ||
          (d.status as string) === "UNDER_REVIEW" ||
          (d.status as string) === "INQUIRY"
      );
    }

    // Net payout share calculation: netPayoutShare = grossCaptured - acceptedRefunds
    const netPayoutShare =
      Math.round(
        Math.max(0, params.grossCaptured - acceptedRefunds) * 100
      ) / 100;

    // Enforce Hold Rule
    let isReadyForPayout = false;
    let holdReason: string | undefined;

    if (!inspectionWindowExpired) {
      holdReason = "Inspection window still active";
    } else if (hasOpenClaims) {
      holdReason = "Open in-app claim pending";
    } else if (hasOpenDispute) {
      holdReason = "Active dispute under review";
    } else {
      isReadyForPayout = true;
    }

    return {
      memberId: params.memberId,
      orderId: params.orderId,
      captureId: params.captureId,
      grossCaptured: params.grossCaptured,
      acceptedRefunds,
      netPayoutShare,
      inspectionWindowExpired,
      hasOpenDispute,
      isReadyForPayout,
      holdReason,
    };
  }

  /**
   * Evaluates settlement for all members in a Clan batch.
   */
  public evaluateClanSettlement(params: {
    clanId: string;
    members: Array<{
      memberId: string;
      orderId: string;
      captureId: string;
      grossCaptured: number;
      acceptedRefunds?: number;
      hasOpenDispute?: boolean;
    }>;
    now?: Date;
  }): ClanSettlementEvaluation {
    const evaluations = params.members.map((m) =>
      this.evaluateMemberSettlement({
        clanId: params.clanId,
        memberId: m.memberId,
        orderId: m.orderId,
        captureId: m.captureId,
        grossCaptured: m.grossCaptured,
        acceptedRefunds: m.acceptedRefunds,
        hasOpenDispute: m.hasOpenDispute,
        now: params.now,
      })
    );

    const totalGrossCaptured =
      Math.round(
        evaluations.reduce((sum, e) => sum + e.grossCaptured, 0) * 100
      ) / 100;

    const totalAcceptedRefunds =
      Math.round(
        evaluations.reduce((sum, e) => sum + e.acceptedRefunds, 0) * 100
      ) / 100;

    const totalNetPayout =
      Math.round(
        evaluations
          .filter((e) => e.isReadyForPayout)
          .reduce((sum, e) => sum + e.netPayoutShare, 0) * 100
      ) / 100;

    const readyMembers = evaluations.filter((e) => e.isReadyForPayout);
    const heldMembers = evaluations.filter((e) => !e.isReadyForPayout);
    const allMembersReady = evaluations.length > 0 && heldMembers.length === 0;

    return {
      clanId: params.clanId,
      evaluations,
      totalGrossCaptured,
      totalAcceptedRefunds,
      totalNetPayout,
      allMembersReady,
      readyMembers,
      heldMembers,
    };
  }

  /**
   * Formats accounting audit payload for Zapier / accounting ingestion upon complete or partial settlement.
   */
  public generateAccountingWebhookPayload(
    params: GenerateAccountingWebhookPayloadParams
  ): AccountingWebhookPayload {
    const timestampStr = params.timestamp
      ? typeof params.timestamp === "string"
        ? params.timestamp
        : params.timestamp.toISOString()
      : new Date().toISOString();

    const roundedTotalPaid = Math.round(params.totalPaid * 100) / 100;
    const eventName = params.event || "clan.settlement.completed";

    return {
      event: eventName,
      eventType: eventName,
      clanId: params.clanId,
      supplierEmail: params.supplierEmail,
      currency: "USD",
      totalPaid: roundedTotalPaid,
      settledMembersCount: params.settledMembers.length,
      settledMembers: params.settledMembers,
      timestamp: timestampStr,
    };
  }
}

let defaultSettlementAdapter: SettlementAdapter | null = null;

export function getSettlementAdapter(): SettlementAdapter {
  if (!defaultSettlementAdapter) {
    defaultSettlementAdapter = new SettlementAdapter();
  }
  return defaultSettlementAdapter;
}
