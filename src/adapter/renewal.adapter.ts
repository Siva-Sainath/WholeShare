import {
  RenewalStorage,
  getRenewalStorage,
  type CommodityCategory,
  type RenewalCheckInRecord,
} from "../storage/renewal.storage.ts";

export interface ScheduleRenewalParams {
  clanId: string;
  memberId: string;
  orderId: string;
  authorizationId: string;
  orderAmount: number;
  category?: CommodityCategory;
  testDurationMinutes?: number;
  now?: Date;
}

export class RenewalAdapter {
  private storage: RenewalStorage;

  constructor(customStorage?: RenewalStorage) {
    this.storage = customStorage || getRenewalStorage();
  }

  /**
   * Schedules category-based renewal check-ins:
   * Fast commodities (flour/coffee) -> 5 days
   * Medium commodities (grains) -> 7 days
   * Specialty commodities -> 10 to 12 days
   * Enforces high-value QR code step-up for orders > $1,000 USD.
   */
  public scheduleRenewal(params: ScheduleRenewalParams): RenewalCheckInRecord {
    const now = params.now || new Date();
    const category = params.category || "FAST";

    let intervalDays = 5;
    if (category === "MEDIUM") intervalDays = 7;
    if (category === "SPECIALTY") intervalDays = 10;

    let intervalMs = intervalDays * 24 * 60 * 60 * 1000;
    if (params.testDurationMinutes !== undefined) {
      intervalMs = params.testDurationMinutes * 60 * 1000;
    }

    const nextCheckIn = new Date(now.getTime() + intervalMs);
    const optOutDeadline = new Date(nextCheckIn.getTime() + 48 * 60 * 60 * 1000);

    const requiresQrStepUp = params.orderAmount > 1000.0;
    const recordId = `renewal-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    const record: RenewalCheckInRecord = {
      id: recordId,
      clanId: params.clanId,
      memberId: params.memberId,
      orderId: params.orderId,
      commodityCategory: category,
      checkInIntervalDays: intervalDays,
      lastCheckInAt: now.toISOString(),
      nextCheckInAt: nextCheckIn.toISOString(),
      optOutDeadlineAt: optOutDeadline.toISOString(),
      status: "PENDING_CHECKIN",
      currentAuthorizationId: params.authorizationId,
      priorAuthorizationIds: [],
      orderAmount: params.orderAmount,
      requiresQrStepUp,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    };

    this.storage.create(record);
    return record;
  }

  /**
   * Scans for pending renewals where the scheduled check-in window has arrived.
   * Transitions them to AWAITING_RENEWAL.
   */
  public checkPendingRenewals(asOfTime: Date = new Date()): RenewalCheckInRecord[] {
    const records = this.storage.getAll();
    const activated: RenewalCheckInRecord[] = [];

    for (const record of records) {
      if (record.status === "PENDING_CHECKIN") {
        const checkInTime = new Date(record.nextCheckInAt).getTime();
        if (asOfTime.getTime() >= checkInTime) {
          record.status = "AWAITING_RENEWAL";
          record.lastCheckInAt = asOfTime.toISOString();
          this.storage.update(record);
          activated.push(record);
        }
      }
    }

    return activated;
  }

  /**
   * Processes member response to check-in: RENEW or OPT_OUT.
   */
  public processMemberDecision(
    renewalId: string,
    decision: "RENEW" | "OPT_OUT"
  ): RenewalCheckInRecord {
    const record = this.storage.getById(renewalId);
    if (!record) {
      throw new Error(`Renewal record '${renewalId}' not found.`);
    }

    if (decision === "RENEW") {
      record.status = "RENEWED";
    } else {
      record.status = "OPTED_OUT";
    }

    this.storage.update(record);
    return record;
  }

  /**
   * Automated void sweeper: Sweeps records in AWAITING_RENEWAL past their 48-hour opt-out deadline.
   * Voids the authorization hold and transitions status to VOIDED.
   */
  public async sweepExpiredHolds(
    asOfTime: Date = new Date(),
    voidFn?: (authId: string) => Promise<unknown>
  ): Promise<RenewalCheckInRecord[]> {
    const records = this.storage.getAll();
    const voided: RenewalCheckInRecord[] = [];

    for (const record of records) {
      if (record.status === "AWAITING_RENEWAL") {
        const deadline = new Date(record.optOutDeadlineAt).getTime();
        if (asOfTime.getTime() > deadline) {
          if (voidFn) {
            await voidFn(record.currentAuthorizationId);
          }
          record.status = "VOIDED";
          this.storage.update(record);
          voided.push(record);
        }
      }
    }

    return voided;
  }

  /**
   * Records reauthorization ID rotation: preserves history of prior authorization IDs
   * and ensures currentAuthorizationId points to the newly refreshed authorization.
   */
  public recordReauthorization(
    renewalId: string,
    newAuthorizationId: string
  ): RenewalCheckInRecord {
    const record = this.storage.getById(renewalId);
    if (!record) {
      throw new Error(`Renewal record '${renewalId}' not found.`);
    }

    if (newAuthorizationId !== record.currentAuthorizationId) {
      record.priorAuthorizationIds.push(record.currentAuthorizationId);
      record.currentAuthorizationId = newAuthorizationId;
    }

    record.status = "RENEWED";
    this.storage.update(record);
    return record;
  }
}
