import {
  PayPalMoneyGateway,
  type AuthorizeHoldParams,
  type AuthorizeHoldResult,
  type FinalBatchCaptureOptions,
  type FinalBatchCaptureResult,
  type VoidAuthorizationResult,
} from "../gateway/PayPalMoneyGateway.ts";
import { type PricingTier } from "../domain/money-math.ts";

export class EscrowBridgeError extends Error {
  readonly code:
    | "INVALID_COALITION"
    | "EMPTY_MEMBERS"
    | "SPENDING_LIMIT_EXCEEDED"
    | "UNAUTHORIZED_MEMBERS_EXIST"
    | "TIER_RESOLUTION_FAILED"
    | "GATEWAY_FAILURE";
  readonly details?: unknown;

  constructor(
    code:
      | "INVALID_COALITION"
      | "EMPTY_MEMBERS"
      | "SPENDING_LIMIT_EXCEEDED"
      | "UNAUTHORIZED_MEMBERS_EXIST"
      | "TIER_RESOLUTION_FAILED"
      | "GATEWAY_FAILURE",
    message: string,
    details?: unknown
  ) {
    super(`[EscrowBridge - ${code}]: ${message}`);
    this.name = "EscrowBridgeError";
    this.code = code;
    this.details = details;
  }
}

/**
 * Developer 1 Coalition member shape from src/lib/types.ts / web-actions.js
 */
export interface BridgeCoalitionMember {
  smeId: string;
  name?: string;
  pledgedUnits: number;
  authorizedCents: number;
  status: string;
  stepUpRequired?: boolean;
  paypalOrderId?: string | null;
  authorizationId?: string | null;
  captureId?: string | null;
  invoiceQrUrl?: string | null;
  maxSpendCents?: number;
  stepUpThresholdCents?: number;
  [key: string]: unknown;
}

/**
 * Developer 1 Coalition shape from src/lib/types.ts / web-actions.js
 */
export interface BridgeCoalition {
  id: string;
  sku: string;
  skuName?: string;
  targetUnits: number;
  currentUnits: number;
  unitPriceCents: number;
  discountTierPct?: number;
  status: string;
  members: BridgeCoalitionMember[];
  createdAt?: string;
  updatedAt?: string;
  [key: string]: unknown;
}

export interface BridgeCatalogTier {
  minUnits: number;
  discountPct?: number;
  unitPriceUsd?: number;
  unitPriceCents?: number;
}

export interface MemberHoldExecutionSummary {
  smeId: string;
  orderId: string;
  status: string;
  holdAmountUsd: number;
  approvalUrl?: string;
  stepUpRequired: boolean;
  invoiceQrUrl?: string;
}

export interface CoalitionEscrowHoldResult {
  coalitionId: string;
  totalPledgedUnits: number;
  totalEscrowAmountUsd: number;
  unitPriceUsd: number;
  membersCount: number;
  holds: MemberHoldExecutionSummary[];
  allSucceeded: boolean;
  coalition: BridgeCoalition;
}

export interface MemberCaptureExecutionSummary {
  smeId: string;
  captureId: string;
  authorizationId: string;
  finalCapturedAmountUsd: number;
  releasedHoldAmountUsd: number;
  status: string;
}

export interface CoalitionEscrowCaptureResult {
  coalitionId: string;
  totalCapturedAmountUsd: number;
  totalReleasedHoldAmountUsd: number;
  effectiveUnitPriceUsd: number;
  effectiveDiscountPct: number;
  captures: MemberCaptureExecutionSummary[];
  coalition: BridgeCoalition;
}

export interface CoalitionEscrowVoidResult {
  coalitionId: string;
  voidedMembersCount: number;
  voids: Array<{ smeId: string; authorizationId: string; status: string }>;
  coalition: BridgeCoalition;
}

export interface AuthorizeEscrowOptions {
  baseCatalogPriceCents?: number;
  stepUpThresholdUsd?: number;
  returnUrl?: string;
  cancelUrl?: string;
}

export interface CaptureEscrowOptions {
  tiers?: BridgeCatalogTier[];
  noteToPayer?: string;
}

/**
 * Deep adapter module bridging Developer 1's in-memory coalition state
 * with Developer 2's ACID PayPalMoneyGateway.
 */
export class EscrowBridgeAdapter {
  private gateway: PayPalMoneyGateway;

  constructor(customGateway?: PayPalMoneyGateway) {
    this.gateway = customGateway || new PayPalMoneyGateway();
  }

  public getGateway(): PayPalMoneyGateway {
    return this.gateway;
  }

  /**
   * Translates a Developer 1 Coalition into Orders v2 authorization holds.
   * Handles:
   * - Integer cents to USD conversion
   * - High-value step-up detection (> $1,000 USD / 100,000 cents) & QR generation
   * - Idempotent hold placement via PayPalMoneyGateway.authorizeHold
   * - In-place member metadata synchronization
   */
  public async authorizeCoalitionEscrow(
    coalition: BridgeCoalition,
    options: AuthorizeEscrowOptions = {}
  ): Promise<CoalitionEscrowHoldResult> {
    if (!coalition || !coalition.id) {
      throw new EscrowBridgeError(
        "INVALID_COALITION",
        "A valid coalition with an id is required."
      );
    }

    if (!Array.isArray(coalition.members) || coalition.members.length === 0) {
      throw new EscrowBridgeError(
        "EMPTY_MEMBERS",
        `Coalition '${coalition.id}' contains no members to authorize.`
      );
    }

    const unitPriceUsd = coalition.unitPriceCents / 100;
    const baseCatalogPriceUsd = options.baseCatalogPriceCents
      ? options.baseCatalogPriceCents / 100
      : unitPriceUsd;

    const holds: MemberHoldExecutionSummary[] = [];
    let totalEscrowAmountUsd = 0;

    for (const member of coalition.members) {
      const orderAmountUsd = (member.authorizedCents || member.pledgedUnits * coalition.unitPriceCents) / 100;
      totalEscrowAmountUsd += orderAmountUsd;

      const maxAutoAuthorizeUsd = member.maxSpendCents
        ? member.maxSpendCents / 100
        : Math.min(5000, Math.max(orderAmountUsd, 1000));

      const stepUpThresholdUsd = member.stepUpThresholdCents
        ? member.stepUpThresholdCents / 100
        : options.stepUpThresholdUsd || 1000;

      const isStepUp = orderAmountUsd > stepUpThresholdUsd;
      member.stepUpRequired = isStepUp;

      let qrCodeUrl: string | undefined;
      if (isStepUp) {
        try {
          const qrResult = await this.gateway.generateInvoiceQrCode({
            clanId: coalition.id,
            memberId: member.smeId,
            orderAmount: orderAmountUsd,
            memo: `Wholeshare Step-Up Authorization: ${coalition.skuName || coalition.sku}`,
          });
          qrCodeUrl = qrResult.paymentUrl || `https://sandbox.paypal.com/invoice/p/#${qrResult.invoiceId}`;
          member.invoiceQrUrl = qrCodeUrl;
        } catch {
          member.invoiceQrUrl = `https://sandbox.paypal.com/invoice/qr/INV2-${coalition.id}-${member.smeId}.png`;
          qrCodeUrl = member.invoiceQrUrl;
        }
      }

      const holdParams: AuthorizeHoldParams = {
        clanId: coalition.id,
        memberId: member.smeId,
        quantity: member.pledgedUnits,
        unitPrice: unitPriceUsd,
        quoteUnitPrice: baseCatalogPriceUsd,
        maxAutoAuthorizeUsd,
        description: `Wholeshare Escrow Hold - ${coalition.skuName || coalition.sku} (${member.pledgedUnits} units)`,
        customId: `${coalition.id}:${member.smeId}`,
        returnUrl: options.returnUrl,
        cancelUrl: options.cancelUrl,
      };

      try {
        const holdResult: AuthorizeHoldResult = await this.gateway.authorizeHold(holdParams);

        member.paypalOrderId = holdResult.orderId;
        member.status = "AUTHORIZED";

        holds.push({
          smeId: member.smeId,
          orderId: holdResult.orderId,
          status: holdResult.status,
          holdAmountUsd: holdResult.orderAmount,
          approvalUrl: holdResult.approvalUrl,
          stepUpRequired: isStepUp,
          invoiceQrUrl: qrCodeUrl,
        });
      } catch (err: unknown) {
        const errMsg = err instanceof Error ? err.message : String(err);
        throw new EscrowBridgeError(
          "GATEWAY_FAILURE",
          `Failed to place authorization hold for member '${member.smeId}': ${errMsg}`,
          err
        );
      }
    }

    coalition.status = "LOCKED";
    if (coalition.updatedAt) {
      coalition.updatedAt = new Date().toISOString();
    }

    return {
      coalitionId: coalition.id,
      totalPledgedUnits: coalition.currentUnits,
      totalEscrowAmountUsd,
      unitPriceUsd,
      membersCount: coalition.members.length,
      holds,
      allSucceeded: holds.length === coalition.members.length,
      coalition,
    };
  }

  /**
   * Executes batch final capture at the unlocked tier price across all authorized members.
   * Enforces 100% member authorization invariant.
   */
  public async captureCoalitionEscrow(
    coalition: BridgeCoalition,
    options: CaptureEscrowOptions = {}
  ): Promise<CoalitionEscrowCaptureResult> {
    if (!coalition || !coalition.id) {
      throw new EscrowBridgeError(
        "INVALID_COALITION",
        "A valid coalition with an id is required."
      );
    }

    const members = coalition.members || [];
    if (members.length === 0) {
      throw new EscrowBridgeError(
        "EMPTY_MEMBERS",
        `Coalition '${coalition.id}' contains no members to capture.`
      );
    }

    // Enforce 100% member authorization invariant
    const missingAuth = members.filter((m) => !m.authorizationId);
    if (missingAuth.length > 0) {
      throw new EscrowBridgeError(
        "UNAUTHORIZED_MEMBERS_EXIST",
        `${missingAuth.length} member(s) lack valid authorizationId: ${missingAuth.map((m) => m.smeId).join(", ")}`
      );
    }

    const mappedTiers: PricingTier[] = (options.tiers || []).map((t) => {
      let unitPrice = 0;
      if (typeof t.unitPriceUsd === "number") {
        unitPrice = t.unitPriceUsd;
      } else if (typeof t.unitPriceCents === "number") {
        unitPrice = t.unitPriceCents / 100;
      } else if (typeof t.discountPct === "number") {
        const basePrice = coalition.unitPriceCents / 100;
        unitPrice = Number((basePrice * (1 - t.discountPct / 100)).toFixed(2));
      } else {
        unitPrice = coalition.unitPriceCents / 100;
      }
      return {
        minQuantity: t.minUnits,
        unitPrice,
      };
    });

    if (mappedTiers.length === 0) {
      mappedTiers.push({
        minQuantity: coalition.targetUnits || 100,
        unitPrice: coalition.unitPriceCents / 100,
      });
    }

    const batchMembers = members.map((m) => {
      if (!m.authorizationId) {
        throw new EscrowBridgeError(
          "UNAUTHORIZED_MEMBERS_EXIST",
          `Member ${m.smeId} lacks valid authorizationId`
        );
      }
      return {
        memberId: m.smeId,
        authorizationId: m.authorizationId,
        status: m.status || "AUTHORIZED",
        quantity: m.pledgedUnits,
        unitPrice: coalition.unitPriceCents / 100,
        orderAmount: (m.authorizedCents || m.pledgedUnits * coalition.unitPriceCents) / 100,
      };
    });

    const batchOptions: FinalBatchCaptureOptions = {
      clanState: {
        clanId: coalition.id,
        commodity: coalition.skuName || coalition.sku,
        targetMoq: coalition.targetUnits,
        currentQuantity: coalition.currentUnits,
        state: "LOCKED",
        tiers: mappedTiers,
        members: batchMembers,
      },
      commodity: coalition.skuName || coalition.sku,
      members: batchMembers,
      tiers: mappedTiers,
      noteToPayer: options.noteToPayer || `Wholeshare Batch Capture - ${coalition.skuName || coalition.sku}`,
    };

    let batchResult: FinalBatchCaptureResult;
    try {
      batchResult = await this.gateway.finalBatchCapture(coalition.id, batchOptions);
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      throw new EscrowBridgeError(
        "GATEWAY_FAILURE",
        `Batch capture failed for coalition '${coalition.id}': ${errMsg}`,
        err
      );
    }

    const captures: MemberCaptureExecutionSummary[] = [];

    for (const cap of batchResult.captures) {
      const member = members.find((m) => m.smeId === cap.memberId);
      if (member) {
        member.captureId = cap.captureId;
        member.status = "CAPTURED";
        member.authorizationId = cap.authorizationId;
      }

      captures.push({
        smeId: cap.memberId,
        captureId: cap.captureId,
        authorizationId: cap.authorizationId,
        finalCapturedAmountUsd: cap.finalCapturedAmount,
        releasedHoldAmountUsd: cap.releasedHoldAmount,
        status: cap.status,
      });
    }

    coalition.status = "FULFILLING";
    coalition.unitPriceCents = Math.round(batchResult.effectiveTier.unitPrice * 100);

    return {
      coalitionId: coalition.id,
      totalCapturedAmountUsd: batchResult.totalCapturedAmount,
      totalReleasedHoldAmountUsd: batchResult.totalReleasedHoldAmount,
      effectiveUnitPriceUsd: batchResult.effectiveTier.unitPrice,
      effectiveDiscountPct: coalition.discountTierPct || 0,
      captures,
      coalition,
    };
  }

  /**
   * Voids open member authorizations when a coalition expires or fails.
   */
  public async voidCoalitionEscrow(
    coalition: BridgeCoalition,
    reason = "Coalition failed to reach minimum order threshold."
  ): Promise<CoalitionEscrowVoidResult> {
    if (!coalition || !coalition.id) {
      throw new EscrowBridgeError(
        "INVALID_COALITION",
        "A valid coalition with an id is required."
      );
    }

    const members = coalition.members || [];
    const voids: Array<{ smeId: string; authorizationId: string; status: string }> = [];

    for (const member of members) {
      const authId = member.authorizationId;
      if (authId && (member.status === "AUTHORIZED" || member.status === "LOCKED")) {
        try {
          const voidRes: VoidAuthorizationResult = await this.gateway.voidAuthorization(
            authId,
            coalition.id,
            member.smeId
          );

          member.status = "VOIDED";
          voids.push({
            smeId: member.smeId,
            authorizationId: authId,
            status: voidRes.status,
          });
        } catch (err: unknown) {
          const errMsg = err instanceof Error ? err.message : String(err);
          throw new EscrowBridgeError(
            "GATEWAY_FAILURE",
            `Failed to void authorization '${authId}' for member '${member.smeId}': ${errMsg}`,
            err
          );
        }
      }
    }

    coalition.status = "CANCELLED";

    return {
      coalitionId: coalition.id,
      voidedMembersCount: voids.length,
      voids,
      coalition,
    };
  }
}

let defaultEscrowBridgeAdapter: EscrowBridgeAdapter | null = null;

export function getEscrowBridgeAdapter(gateway?: PayPalMoneyGateway): EscrowBridgeAdapter {
  if (!defaultEscrowBridgeAdapter || gateway) {
    defaultEscrowBridgeAdapter = new EscrowBridgeAdapter(gateway);
  }
  return defaultEscrowBridgeAdapter;
}
