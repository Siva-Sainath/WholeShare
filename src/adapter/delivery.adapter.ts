import {
  DeliveryStorage,
  getDeliveryStorage,
  type DeliveryRecord,
  type DeliverySource,
} from "../storage/delivery.storage.ts";

export class DeliveryConfirmationError extends Error {
  readonly code:
    | "OVERWRITE_FORBIDDEN"
    | "INVALID_ROLE"
    | "INVALID_TIMESTAMPS"
    | "MISSING_REQUIRED_FIELDS";

  constructor(
    code:
      | "OVERWRITE_FORBIDDEN"
      | "INVALID_ROLE"
      | "INVALID_TIMESTAMPS"
      | "MISSING_REQUIRED_FIELDS",
    message: string
  ) {
    super(`[DeliveryConfirmation - ${code}]: ${message}`);
    this.name = "DeliveryConfirmationError";
    this.code = code;
  }
}

export interface ConfirmDeliveryParams {
  clanId: string;
  memberId: string;
  role: "supplier" | "buyer";
  deliveredAt?: string | Date;
  trackingNumber?: string;
  carrierName?: string;
  conditionNotes?: string;
  source?: DeliverySource;
}

export const FORTY_EIGHT_HOURS_MS = 48 * 60 * 60 * 1000;
export const TWO_DAYS_MS = 2 * 24 * 60 * 60 * 1000;

export class DeliveryAdapter {
  private storage: DeliveryStorage;

  constructor(customStorage?: DeliveryStorage) {
    this.storage = customStorage || getDeliveryStorage();
  }

  /**
   * Records a delivery confirmation for either the supplier or the buyer.
   * Enforces the ADR-0011 single-write rule: existing timestamps cannot be overwritten.
   * Computes the 48-hour inspection countdown ending at max(supplier, buyer) + 48 hours.
   */
  public confirmDelivery(params: ConfirmDeliveryParams): DeliveryRecord {
    if (!params.clanId || !params.memberId || !params.role) {
      throw new DeliveryConfirmationError(
        "MISSING_REQUIRED_FIELDS",
        "clanId, memberId, and role are required for delivery confirmation."
      );
    }

    if (params.role !== "supplier" && params.role !== "buyer") {
      throw new DeliveryConfirmationError(
        "INVALID_ROLE",
        `Role must be either 'supplier' or 'buyer', received: ${params.role}`
      );
    }

    const timestampStr = params.deliveredAt
      ? typeof params.deliveredAt === "string"
        ? new Date(params.deliveredAt).toISOString()
        : params.deliveredAt.toISOString()
      : new Date().toISOString();

    let record = this.storage.getByMember(params.clanId, params.memberId);

    if (!record) {
      record = {
        id: `del_${params.clanId}_${params.memberId}`,
        clanId: params.clanId,
        memberId: params.memberId,
        trackingNumber: params.trackingNumber || "1Z9999999999999999",
        carrierName: params.carrierName || "UPS",
        supplierDeliveredAt: null,
        buyerDeliveredAt: null,
        inspectionWindowEndsAt: null,
        source: params.source || (params.role === "supplier" ? "supplier" : "buyer"),
        conditionNotes: params.conditionNotes || null,
        createdAt: new Date().toISOString(),
      };
    }

    // Enforce single-write rule
    if (params.role === "supplier") {
      if (record.supplierDeliveredAt) {
        throw new DeliveryConfirmationError(
          "OVERWRITE_FORBIDDEN",
          `supplierDeliveredAt is already set to ${record.supplierDeliveredAt} and cannot be overwritten.`
        );
      }
      record.supplierDeliveredAt = timestampStr;
      if (!params.source) {
        record.source = "supplier";
      }
    } else if (params.role === "buyer") {
      if (record.buyerDeliveredAt) {
        throw new DeliveryConfirmationError(
          "OVERWRITE_FORBIDDEN",
          `buyerDeliveredAt is already set to ${record.buyerDeliveredAt} and cannot be overwritten.`
        );
      }
      record.buyerDeliveredAt = timestampStr;
      if (!params.source) {
        record.source = "buyer";
      }
    }

    if (params.conditionNotes) {
      record.conditionNotes = params.conditionNotes;
    }
    if (params.trackingNumber) {
      record.trackingNumber = params.trackingNumber;
    }
    if (params.carrierName) {
      record.carrierName = params.carrierName;
    }

    // Recompute inspection countdown
    record.inspectionWindowEndsAt = this.computeInspectionWindow(
      record.supplierDeliveredAt,
      record.buyerDeliveredAt
    );

    this.storage.upsert(record);
    return record;
  }

  /**
   * Computes inspectionWindowEndsAt as 48 hours after the later of both confirmations.
   * Returns null if either confirmation is still pending.
   */
  public computeInspectionWindow(
    supplierDeliveredAt: string | null,
    buyerDeliveredAt: string | null
  ): string | null {
    if (!supplierDeliveredAt || !buyerDeliveredAt) {
      return null;
    }

    const supplierMs = new Date(supplierDeliveredAt).getTime();
    const buyerMs = new Date(buyerDeliveredAt).getTime();
    const laterMs = Math.max(supplierMs, buyerMs);

    return new Date(laterMs + FORTY_EIGHT_HOURS_MS).toISOString();
  }

  /**
   * Evaluates the ADR-0011 2-day auto-confirmation rule:
   * If the buyer remains silent for 2 days (48 hours) after the supplier confirmation,
   * delivery counts as confirmed 2 days after the supplier confirmation,
   * and the 48-hour inspection countdown begins then (window ends at supplierDeliveredAt + 96 hours).
   */
  public evaluateAutoConfirmation(
    clanId: string,
    memberId: string,
    asOfDate: Date = new Date()
  ): DeliveryRecord | null {
    const record = this.storage.getByMember(clanId, memberId);
    if (!record || !record.supplierDeliveredAt || record.buyerDeliveredAt) {
      return record;
    }

    const supplierMs = new Date(record.supplierDeliveredAt).getTime();
    const autoConfirmThresholdMs = supplierMs + TWO_DAYS_MS;

    if (asOfDate.getTime() >= autoConfirmThresholdMs) {
      const autoConfirmedDate = new Date(autoConfirmThresholdMs);
      record.buyerDeliveredAt = autoConfirmedDate.toISOString();
      record.source = "auto_confirmed";
      record.inspectionWindowEndsAt = new Date(
        autoConfirmThresholdMs + FORTY_EIGHT_HOURS_MS
      ).toISOString();
      if (!record.conditionNotes) {
        record.conditionNotes = "Auto-confirmed: buyer silence for 48 hours following supplier delivery confirmation.";
      }
      this.storage.upsert(record);
    }

    return record;
  }

  /**
   * Express/HTTP request handler for POST /api/delivery/confirm.
   */
  public async handleDeliveryConfirmRequest(req: any, res: any): Promise<void> {
    try {
      const body = req.body || {};
      const result = this.confirmDelivery({
        clanId: body.clanId,
        memberId: body.memberId,
        role: body.role,
        deliveredAt: body.deliveredAt,
        trackingNumber: body.trackingNumber,
        carrierName: body.carrierName,
        conditionNotes: body.conditionNotes,
        source: body.source,
      });

      res.status(200).json({
        success: true,
        record: result,
      });
    } catch (err: any) {
      if (err instanceof DeliveryConfirmationError) {
        res.status(400).json({
          success: false,
          error: err.code,
          message: err.message,
        });
        return;
      }
      res.status(500).json({
        success: false,
        error: "INTERNAL_ERROR",
        message: err.message || "An unexpected error occurred.",
      });
    }
  }
}

let defaultAdapter: DeliveryAdapter | null = null;

export function getDeliveryAdapter(): DeliveryAdapter {
  if (!defaultAdapter) {
    defaultAdapter = new DeliveryAdapter();
  }
  return defaultAdapter;
}
