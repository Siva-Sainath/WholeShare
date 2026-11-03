import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { RenewalStorage } from "../src/storage/renewal.storage.ts";
import { RenewalAdapter } from "../src/adapter/renewal.adapter.ts";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const TEST_DIR = path.resolve(__dirname, "temp-renewal-test");

describe("Ticket 13: Member Opt-In Renewals, Reauthorization & QR Step-Up", () => {
  let storage: RenewalStorage;
  let adapter: RenewalAdapter;
  const testRenewalPath = path.join(TEST_DIR, "test-renewals.json");

  beforeEach(() => {
    if (!fs.existsSync(TEST_DIR)) {
      fs.mkdirSync(TEST_DIR, { recursive: true });
    }
    fs.writeFileSync(testRenewalPath, JSON.stringify([], null, 2), "utf8");
    storage = new RenewalStorage(testRenewalPath);
    adapter = new RenewalAdapter(storage);
  });

  afterEach(() => {
    if (fs.existsSync(TEST_DIR)) {
      fs.rmSync(TEST_DIR, { recursive: true, force: true });
    }
  });

  describe("1. Category-Based Renewal Scheduling", () => {
    it("schedules FAST commodity category with 5-day check-in interval", () => {
      const t0 = new Date("2026-10-01T12:00:00Z");
      const record = adapter.scheduleRenewal({
        clanId: "clan-flour-fast",
        memberId: "buyer-maria",
        orderId: "ORD-1",
        authorizationId: "AUTH-1",
        orderAmount: 720.0,
        category: "FAST",
        now: t0,
      });

      assert.equal(record.commodityCategory, "FAST");
      assert.equal(record.checkInIntervalDays, 5);
      assert.equal(record.status, "PENDING_CHECKIN");
      assert.equal(record.nextCheckInAt, "2026-10-06T12:00:00.000Z"); // +5 days
      assert.equal(record.optOutDeadlineAt, "2026-10-08T12:00:00.000Z"); // +48 hours
      assert.equal(record.requiresQrStepUp, false);
    });

    it("schedules MEDIUM commodity category with 7-day check-in interval", () => {
      const t0 = new Date("2026-10-01T12:00:00Z");
      const record = adapter.scheduleRenewal({
        clanId: "clan-grain-medium",
        memberId: "buyer-grain",
        orderId: "ORD-2",
        authorizationId: "AUTH-2",
        orderAmount: 850.0,
        category: "MEDIUM",
        now: t0,
      });

      assert.equal(record.checkInIntervalDays, 7);
      assert.equal(record.nextCheckInAt, "2026-10-08T12:00:00.000Z"); // +7 days
    });

    it("schedules SPECIALTY commodity category with 10-day check-in interval", () => {
      const t0 = new Date("2026-10-01T12:00:00Z");
      const record = adapter.scheduleRenewal({
        clanId: "clan-spice-specialty",
        memberId: "buyer-spice",
        orderId: "ORD-3",
        authorizationId: "AUTH-3",
        orderAmount: 950.0,
        category: "SPECIALTY",
        now: t0,
      });

      assert.equal(record.checkInIntervalDays, 10);
      assert.equal(record.nextCheckInAt, "2026-10-11T12:00:00.000Z"); // +10 days
    });
  });

  describe("2. High-Value QR Code Step-Up Trigger", () => {
    it("requires QR code step-up for orders exceeding $1,000 USD", () => {
      const record = adapter.scheduleRenewal({
        clanId: "clan-high-value",
        memberId: "buyer-maria",
        orderId: "39J81892GY6122912",
        authorizationId: "19S92787G0883724A",
        orderAmount: 1440.0, // > $1,000
        category: "FAST",
      });

      assert.equal(record.requiresQrStepUp, true);
    });

    it("does not require QR step-up for orders <= $1,000 USD", () => {
      const record = adapter.scheduleRenewal({
        clanId: "clan-standard-value",
        memberId: "buyer-small",
        orderId: "ORD-SMALL",
        authorizationId: "AUTH-SMALL",
        orderAmount: 580.0,
        category: "FAST",
      });

      assert.equal(record.requiresQrStepUp, false);
    });
  });

  describe("3. Check-In Window Activation & Member Decisions", () => {
    it("transitions pending check-in to AWAITING_RENEWAL when check-in date arrives", () => {
      const t0 = new Date("2026-10-01T12:00:00Z");
      const record = adapter.scheduleRenewal({
        clanId: "clan-1",
        memberId: "buyer-1",
        orderId: "ORD-1",
        authorizationId: "AUTH-1",
        orderAmount: 500.0,
        category: "FAST",
        now: t0,
      });

      // Advance clock past day 5
      const t5 = new Date("2026-10-06T13:00:00Z");
      const activated = adapter.checkPendingRenewals(t5);

      assert.equal(activated.length, 1);
      assert.equal(activated[0].id, record.id);
      assert.equal(activated[0].status, "AWAITING_RENEWAL");
    });

    it("records member RENEW decision", () => {
      const record = adapter.scheduleRenewal({
        clanId: "clan-1",
        memberId: "buyer-1",
        orderId: "ORD-1",
        authorizationId: "AUTH-1",
        orderAmount: 500.0,
      });

      const updated = adapter.processMemberDecision(record.id, "RENEW");
      assert.equal(updated.status, "RENEWED");
    });

    it("records member OPT_OUT decision", () => {
      const record = adapter.scheduleRenewal({
        clanId: "clan-1",
        memberId: "buyer-1",
        orderId: "ORD-1",
        authorizationId: "AUTH-1",
        orderAmount: 500.0,
      });

      const updated = adapter.processMemberDecision(record.id, "OPT_OUT");
      assert.equal(updated.status, "OPTED_OUT");
    });
  });

  describe("4. 48-Hour Opt-Out Default & Automated Void Sweeper", () => {
    it("sweeps expired holds past the 48-hour opt-out deadline and triggers void", async () => {
      const t0 = new Date("2026-10-01T12:00:00Z");
      const record = adapter.scheduleRenewal({
        clanId: "clan-1",
        memberId: "buyer-silent",
        orderId: "ORD-EXPIRE",
        authorizationId: "AUTH-TO-VOID",
        orderAmount: 600.0,
        category: "FAST",
        now: t0,
      });

      // Advance to awaiting renewal
      adapter.checkPendingRenewals(new Date("2026-10-06T13:00:00Z"));

      let voidedAuthId: string | null = null;
      // Advance clock past day 8 (48 hours past check-in)
      const t8 = new Date("2026-10-09T12:00:00Z");
      const voidedRecords = await adapter.sweepExpiredHolds(t8, async (authId) => {
        voidedAuthId = authId;
      });

      assert.equal(voidedRecords.length, 1);
      assert.equal(voidedRecords[0].status, "VOIDED");
      assert.equal(voidedAuthId, "AUTH-TO-VOID");
    });

    it("does not sweep holds before the 48-hour opt-out deadline has elapsed", async () => {
      const t0 = new Date("2026-10-01T12:00:00Z");
      adapter.scheduleRenewal({
        clanId: "clan-1",
        memberId: "buyer-silent",
        orderId: "ORD-ACTIVE",
        authorizationId: "AUTH-STILL-ACTIVE",
        orderAmount: 600.0,
        category: "FAST",
        now: t0,
      });

      adapter.checkPendingRenewals(new Date("2026-10-06T13:00:00Z"));

      let voidCalled = false;
      // Time is day 7 (within 48h deadline)
      const t7 = new Date("2026-10-07T12:00:00Z");
      const voidedRecords = await adapter.sweepExpiredHolds(t7, async () => {
        voidCalled = true;
      });

      assert.equal(voidedRecords.length, 0);
      assert.equal(voidCalled, false);
    });
  });

  describe("5. Reauthorization History & ID Rotation", () => {
    it("preserves history of prior authorization IDs and updates current authorization ID", () => {
      const record = adapter.scheduleRenewal({
        clanId: "clan-1",
        memberId: "buyer-1",
        orderId: "ORD-1",
        authorizationId: "AUTH-ORIGINAL",
        orderAmount: 720.0,
      });

      assert.equal(record.currentAuthorizationId, "AUTH-ORIGINAL");
      assert.equal(record.priorAuthorizationIds.length, 0);

      // Refresh authorization
      const updated = adapter.recordReauthorization(record.id, "AUTH-REFRESHED-V2");

      assert.equal(updated.currentAuthorizationId, "AUTH-REFRESHED-V2");
      assert.deepEqual(updated.priorAuthorizationIds, ["AUTH-ORIGINAL"]);
      assert.equal(updated.status, "RENEWED");
    });
  });
});
