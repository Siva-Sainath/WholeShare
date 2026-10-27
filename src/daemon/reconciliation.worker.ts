import {
  IdempotencyStorage,
  getIdempotencyStorage,
  type IdempotencyRecord,
} from "../storage/idempotency.storage.ts";
import { getGatewayConfig } from "../config/gateway.config.ts";

export interface RemoteStatusQueryProvider {
  getAuthorization?: (id: string) => Promise<{ id?: string; status?: string }>;
  getCapture?: (id: string) => Promise<{ id?: string; status?: string }>;
  getRefund?: (id: string) => Promise<{ id?: string; status?: string }>;
  getPayoutBatch?: (id: string) => Promise<{ batch_header?: { batch_status?: string } }>;
  getDispute?: (id: string) => Promise<{ dispute_id?: string; status?: string }>;
}

export interface ReconciliationSummary {
  totalScanned: number;
  reconciledSucceeded: number;
  reconciledFailed: number;
  escalatedNeedsReview: number;
  rechecksIncremented: number;
  records: Array<{
    operationKey: string;
    operationType: string;
    previousStatus: string;
    updatedStatus: string;
    reason: string;
  }>;
}

export class ReconciliationWorker {
  private storage: IdempotencyStorage;
  private queryProvider?: RemoteStatusQueryProvider;
  private retentionHours: number;
  private maxRechecks: number;
  private activeLocks: Set<string>;

  constructor(
    customStorage?: IdempotencyStorage,
    customProvider?: RemoteStatusQueryProvider,
    retentionHours?: number,
    maxRechecks?: number
  ) {
    this.storage = customStorage || getIdempotencyStorage();
    this.queryProvider = customProvider;
    const config = getGatewayConfig();
    this.retentionHours = retentionHours ?? config.keyRetentionHours ?? 72;
    this.maxRechecks = maxRechecks ?? config.maxPendingRecheckCount ?? 5;
    this.activeLocks = new Set<string>();
  }

  /**
   * Simulates SELECT ... FOR UPDATE SKIP LOCKED
   * Claims pending records that are not currently locked by another worker in-flight.
   */
  public claimPendingRecords(limit: number = 20): IdempotencyRecord[] {
    const allRecords = this.storage.getAll();
    const claimed: IdempotencyRecord[] = [];

    for (const record of allRecords) {
      if (record.status === "PENDING" && !this.activeLocks.has(record.operationKey)) {
        this.activeLocks.add(record.operationKey);
        claimed.push(record);
        if (claimed.length >= limit) break;
      }
    }

    return claimed;
  }

  /**
   * Releases lock for a record.
   */
  public releaseLock(operationKey: string): void {
    this.activeLocks.delete(operationKey);
  }

  /**
   * Reconciles a single pending record.
   * Enforces immutable safety window: measures strictly from firstSentAt.
   */
  public async reconcileRecord(
    record: IdempotencyRecord,
    now: Date = new Date()
  ): Promise<{ updatedStatus: string; reason: string }> {
    const firstSent = new Date(record.firstSentAt).getTime();
    const ageMs = now.getTime() - firstSent;
    const retentionMs = this.retentionHours * 60 * 60 * 1000;

    // Check 1: Past immutable retention window
    if (ageMs > retentionMs) {
      this.storage.updateStatus(record.operationKey, "NEEDS_REVIEW");
      return {
        updatedStatus: "NEEDS_REVIEW",
        reason: `PENDING past retention window of ${this.retentionHours}h (age: ${(ageMs / 3600000).toFixed(1)}h). Escalated.`,
      };
    }

    // Check 2: Max recheck count exceeded
    if (record.recheckCount >= this.maxRechecks) {
      this.storage.updateStatus(record.operationKey, "NEEDS_REVIEW");
      return {
        updatedStatus: "NEEDS_REVIEW",
        reason: `Exceeded max pending rechecks (${record.recheckCount}/${this.maxRechecks}). Escalated to NEEDS_REVIEW.`,
      };
    }

    // Check 3: Query remote status if provider supplied
    if (this.queryProvider && record.referenceId) {
      try {
        const ref = record.referenceId.split(":")[0];
        const opType = record.operationType;

        if (opType === "CAPTURE" && this.queryProvider.getCapture) {
          const remote = await this.queryProvider.getCapture(ref);
          if (
            remote?.status === "COMPLETED" ||
            remote?.status === "PARTIALLY_REFUNDED" ||
            remote?.status === "REFUNDED"
          ) {
            this.storage.updateStatus(record.operationKey, "SUCCEEDED", remote.id || ref);
            return {
              updatedStatus: "SUCCEEDED",
              reason: `Remote capture verified as ${remote.status} on PayPal.`,
            };
          }
        } else if (opType === "REFUND" && this.queryProvider.getRefund) {
          const remote = await this.queryProvider.getRefund(ref);
          if (remote?.status === "COMPLETED") {
            this.storage.updateStatus(record.operationKey, "SUCCEEDED", remote.id || ref);
            return {
              updatedStatus: "SUCCEEDED",
              reason: "Remote refund verified as COMPLETED on PayPal.",
            };
          }
        } else if (opType === "AUTHORIZATION" && this.queryProvider.getAuthorization) {
          const remote = await this.queryProvider.getAuthorization(ref);
          if (remote?.status === "CREATED" || remote?.status === "CAPTURED") {
            this.storage.updateStatus(record.operationKey, "SUCCEEDED", remote.id || ref);
            return {
              updatedStatus: "SUCCEEDED",
              reason: `Remote authorization verified as ${remote.status} on PayPal.`,
            };
          }
        } else if (opType === "PAYOUT" && this.queryProvider.getPayoutBatch) {
          const remote = await this.queryProvider.getPayoutBatch(ref);
          const batchStatus = remote?.batch_header?.batch_status;
          if (batchStatus === "SUCCESS" || batchStatus === "PENDING") {
            this.storage.updateStatus(record.operationKey, "SUCCEEDED", ref);
            return {
              updatedStatus: "SUCCEEDED",
              reason: `Remote payout batch verified as ${batchStatus} on PayPal.`,
            };
          }
        } else if (opType === "DISPUTE_OFFER" && this.queryProvider.getDispute) {
          const remote = await this.queryProvider.getDispute(ref);
          if (remote?.status === "UNDER_REVIEW" || remote?.status === "RESOLVED") {
            this.storage.updateStatus(record.operationKey, "SUCCEEDED", ref);
            return {
              updatedStatus: "SUCCEEDED",
              reason: `Remote dispute offer verified in status ${remote.status}.`,
            };
          }
        }
      } catch (err: unknown) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        if (/NOT_FOUND|404/i.test(errorMsg)) {
          this.storage.updateStatus(record.operationKey, "FAILED");
          return {
            updatedStatus: "FAILED",
            reason: `Remote resource not found on PayPal: ${errorMsg}. Marked as FAILED.`,
          };
        }
      }
    }

    // Default: increment recheck count
    this.storage.incrementRecheck(record.operationKey);
    return {
      updatedStatus: "PENDING",
      reason: `Recheck count incremented to ${record.recheckCount + 1}.`,
    };
  }

  /**
   * Reconciles all claimed pending records.
   */
  public async reconcileBatch(
    limit: number = 20,
    now: Date = new Date()
  ): Promise<ReconciliationSummary> {
    const claimed = this.claimPendingRecords(limit);
    const summary: ReconciliationSummary = {
      totalScanned: claimed.length,
      reconciledSucceeded: 0,
      reconciledFailed: 0,
      escalatedNeedsReview: 0,
      rechecksIncremented: 0,
      records: [],
    };

    for (const record of claimed) {
      try {
        const result = await this.reconcileRecord(record, now);
        if (result.updatedStatus === "SUCCEEDED") {
          summary.reconciledSucceeded++;
        } else if (result.updatedStatus === "FAILED") {
          summary.reconciledFailed++;
        } else if (result.updatedStatus === "NEEDS_REVIEW") {
          summary.escalatedNeedsReview++;
        } else if (result.updatedStatus === "PENDING") {
          summary.rechecksIncremented++;
        }

        summary.records.push({
          operationKey: record.operationKey,
          operationType: record.operationType,
          previousStatus: "PENDING",
          updatedStatus: result.updatedStatus,
          reason: result.reason,
        });
      } finally {
        this.releaseLock(record.operationKey);
      }
    }

    return summary;
  }
}
