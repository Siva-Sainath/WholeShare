import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  RepaymentStorage,
  type SupplierRepaymentDebt,
} from "../src/storage/repayment.storage.ts";
import {
  DeliveryStorage,
  type DeliveryRecord,
} from "../src/storage/delivery.storage.ts";
import {
  LateDisputeAdapter,
  SingleRefundViolationError,
  InspectionWindowActiveError,
  assertCanRefund,
  buildBuyerAgentAssistanceNotes,
  type ExistingRefund,
} from "../src/adapter/late-dispute.adapter.ts";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const TEST_DIR = path.resolve(__dirname, "temp-late-dispute-test");

describe("Ticket 10b: Late Dispute Forwarding & Supplier Repayment Tracking", () => {
  let deliveryStorage: DeliveryStorage;
  let repaymentStorage: RepaymentStorage;
  let adapter: LateDisputeAdapter;

  const testDeliveryPath = path.join(TEST_DIR, "test-delivery.json");
  const testRepaymentPath = path.join(TEST_DIR, "test-supplier-debts.json");

  const CLAN_ID = "clan-austin-organic-flour-01";
  const MEMBER_ID = "buyer-maria-bakery";
  const CAPTURE_ID = "74H63527HK822241U";
  const SUPPLIER_EMAIL = "sb-t43fur53471579@business.example.com";
  const DISPUTE_ID = "PP-D-10194658";

  // Delivery confirmed at T0, inspection window is 48 hours later (T0 + 48h)
  const T0 = new Date("2026-10-20T10:00:00.000Z");
  const INSPECTION_WINDOW_END = new Date("2026-10-22T10:00:00.000Z").toISOString();

  beforeEach(() => {
    if (!fs.existsSync(TEST_DIR)) {
      fs.mkdirSync(TEST_DIR, { recursive: true });
    }
    fs.writeFileSync(testDeliveryPath, JSON.stringify([], null, 2), "utf8");
    fs.writeFileSync(testRepaymentPath, JSON.stringify([], null, 2), "utf8");

    deliveryStorage = new DeliveryStorage(testDeliveryPath);
    repaymentStorage = new RepaymentStorage(testRepaymentPath);
    adapter = new LateDisputeAdapter(deliveryStorage, repaymentStorage);

    // Seed valid DeliveryRecord with active 48-hour inspection clock
    const deliveryRecord: DeliveryRecord = {
      id: `del_${CLAN_ID}_${MEMBER_ID}`,
      clanId: CLAN_ID,
      memberId: MEMBER_ID,
      trackingNumber: "1Z9999999999999999",
      carrierName: "UPS",
      supplierDeliveredAt: T0.toISOString(),
      buyerDeliveredAt: T0.toISOString(),
      inspectionWindowEndsAt: INSPECTION_WINDOW_END,
      source: "buyer",
      conditionNotes: "Delivered to loading dock",
      createdAt: T0.toISOString(),
    };
    deliveryStorage.upsert(deliveryRecord);
  });

  afterEach(() => {
    if (fs.existsSync(TEST_DIR)) {
      fs.rmSync(TEST_DIR, { recursive: true, force: true });
    }
  });

  describe("1. RepaymentStorage Invariants", () => {
    it("creates, retrieves, and updates supplier repayment debt records", () => {
      const debtRecord: SupplierRepaymentDebt = {
        id: "debt_20261026_001",
        clanId: CLAN_ID,
        memberId: MEMBER_ID,
        disputeId: DISPUTE_ID,
        captureId: CAPTURE_ID,
        supplierEmail: SUPPLIER_EMAIL,
        disputeAmount: 116.0,
        debtAmount: 116.0,
        reason: "Late dispute post-payout resolution",
        status: "OUTSTANDING",
        repaidAmount: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      repaymentStorage.create(debtRecord);

      const retrievedById = repaymentStorage.getById("debt_20261026_001");
      assert.notEqual(retrievedById, null);
      assert.equal(retrievedById?.disputeId, DISPUTE_ID);
      assert.equal(retrievedById?.debtAmount, 116.0);
      assert.equal(retrievedById?.status, "OUTSTANDING");

      const retrievedBySupplier = repaymentStorage.getBySupplier(SUPPLIER_EMAIL);
      assert.equal(retrievedBySupplier.length, 1);
      assert.equal(retrievedBySupplier[0].id, "debt_20261026_001");

      const retrievedByDispute = repaymentStorage.getByDisputeId(DISPUTE_ID);
      assert.notEqual(retrievedByDispute, null);
      assert.equal(retrievedByDispute?.id, "debt_20261026_001");

      // Update status
      debtRecord.status = "PARTIALLY_REPAID";
      debtRecord.repaidAmount = 58.0;
      debtRecord.updatedAt = new Date().toISOString();
      repaymentStorage.update(debtRecord);

      const updated = repaymentStorage.getById("debt_20261026_001");
      assert.equal(updated?.status, "PARTIALLY_REPAID");
      assert.equal(updated?.repaidAmount, 58.0);
    });

    it("rejects duplicate debt IDs on creation", () => {
      const debtRecord: SupplierRepaymentDebt = {
        id: "debt_20261026_dup",
        clanId: CLAN_ID,
        memberId: MEMBER_ID,
        disputeId: DISPUTE_ID,
        captureId: CAPTURE_ID,
        supplierEmail: SUPPLIER_EMAIL,
        disputeAmount: 116.0,
        debtAmount: 116.0,
        reason: "Duplicate debt ID invariant test",
        status: "OUTSTANDING",
        repaidAmount: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      repaymentStorage.create(debtRecord);
      assert.throws(() => repaymentStorage.create(debtRecord), /already exists/);
    });

    it("throws error when updating non-existent debt record", () => {
      const nonExistentRecord: SupplierRepaymentDebt = {
        id: "debt_nonexistent_999",
        clanId: CLAN_ID,
        memberId: MEMBER_ID,
        disputeId: "PP-D-99999999",
        captureId: CAPTURE_ID,
        supplierEmail: SUPPLIER_EMAIL,
        disputeAmount: 50.0,
        debtAmount: 50.0,
        reason: "Non-existent update test",
        status: "OUTSTANDING",
        repaidAmount: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      assert.throws(() => repaymentStorage.update(nonExistentRecord), /Cannot update non-existent/);
    });
  });

  describe("2. Late Dispute Detection (Timestamp Before vs After Window)", () => {
    it("flags claim as NOT late when timestamp is within active 48-hour inspection clock", () => {
      // 24 hours after delivery: inside active inspection window
      const checkDate = new Date("2026-10-21T10:00:00.000Z");

      const isLate = adapter.isLateDispute(CLAN_ID, MEMBER_ID, checkDate);
      assert.equal(isLate, false);

      const timing = adapter.evaluateDisputeTiming(CLAN_ID, MEMBER_ID, checkDate);
      assert.equal(timing.isLate, false);
      assert.equal(timing.inspectionWindowEndsAt, INSPECTION_WINDOW_END);
      assert.match(timing.reason, /still active/);
    });

    it("flags claim as LATE when timestamp is past the 48-hour inspection clock", () => {
      // 52 hours after delivery: 4 hours past inspection window
      const checkDate = new Date("2026-10-22T14:00:00.000Z");

      const isLate = adapter.isLateDispute(CLAN_ID, MEMBER_ID, checkDate);
      assert.equal(isLate, true);

      const timing = adapter.evaluateDisputeTiming(CLAN_ID, MEMBER_ID, checkDate);
      assert.equal(timing.isLate, true);
      assert.equal(timing.inspectionWindowEndsAt, INSPECTION_WINDOW_END);
      assert.match(timing.reason, /past 48-hour inspection window/);
    });

    it("returns false if delivery confirmation record has no inspection window set", () => {
      const unconfirmedMember = "buyer-chen-dimsum";
      const isLate = adapter.isLateDispute(CLAN_ID, unconfirmedMember);
      assert.equal(isLate, false);

      const timing = adapter.evaluateDisputeTiming(CLAN_ID, unconfirmedMember);
      assert.equal(timing.isLate, false);
      assert.equal(timing.inspectionWindowEndsAt, null);
    });
  });

  describe("3. Forwarding Assistance Notes for Buyer Agent", () => {
    it("generates comprehensive personal agent assistance notes for buyer when forwarding late dispute", () => {
      const checkDate = new Date("2026-10-22T15:00:00.000Z"); // 5 hours post-window

      const result = adapter.forwardLateDispute({
        clanId: CLAN_ID,
        memberId: MEMBER_ID,
        captureId: CAPTURE_ID,
        disputeId: DISPUTE_ID,
        claimedAmount: 116.0,
        reason: "Discovered moisture damage on 20 flour bags after 48-hour warehouse unstacking",
        evidenceNotes: "Warehouse inspection log and 3 timestamped moisture probe photos attached",
        buyerAgentNotes: "Buyer Maria attempted in-app claim but window had lapsed by 5 hours. Forwarding under ADR-0012.",
        asOfDate: checkDate,
      });

      assert.equal(result.isLate, true);
      assert.equal(result.status, "FORWARDED_TO_PAYPAL");
      assert.equal(result.disputeId, DISPUTE_ID);
      assert.equal(result.inspectionWindowEndsAt, INSPECTION_WINDOW_END);

      // Verify assistance notes content
      const notes = result.personalAgentAssistanceNotes;
      assert.match(notes, /SyndicatePay Personal Buyer Agent Assistance Brief/);
      assert.match(notes, new RegExp(DISPUTE_ID));
      assert.match(notes, new RegExp(MEMBER_ID));
      assert.match(notes, new RegExp(CAPTURE_ID));
      assert.match(notes, /\$116\.00 USD/);
      assert.match(notes, /expired at 2026-10-22T10:00:00\.000Z/);
      assert.match(notes, /External Supplier Agreement \(ADR-0012\)/);
      assert.match(notes, /enforceable debt repayment obligation/);
      assert.match(notes, /moisture damage on 20 flour bags/);
      assert.match(notes, /moisture probe photos attached/);
    });

    it("strictly blocks forwardLateDispute when inspection window is still active unless explicitly permitted", () => {
      // 12 hours after delivery: inspection window still active
      const activeDate = new Date("2026-10-20T22:00:00.000Z");

      assert.throws(
        () =>
          adapter.forwardLateDispute({
            clanId: CLAN_ID,
            memberId: MEMBER_ID,
            captureId: CAPTURE_ID,
            disputeId: DISPUTE_ID,
            claimedAmount: 116.0,
            reason: "Early claim attempted via late dispute channel",
            asOfDate: activeDate,
          }),
        (err: Error) => {
          assert(err instanceof InspectionWindowActiveError);
          assert.equal(err.clanId, CLAN_ID);
          assert.equal(err.memberId, MEMBER_ID);
          assert.equal(err.inspectionWindowEndsAt, INSPECTION_WINDOW_END);
          return true;
        }
      );
    });

    it("permits forwarding with active window flag when allowActiveWindow is explicitly set", () => {
      const activeDate = new Date("2026-10-20T22:00:00.000Z");

      const result = adapter.forwardLateDispute({
        clanId: CLAN_ID,
        memberId: MEMBER_ID,
        captureId: CAPTURE_ID,
        disputeId: DISPUTE_ID,
        claimedAmount: 116.0,
        reason: "Expedited dispute escalation requested by buyer",
        asOfDate: activeDate,
        allowActiveWindow: true,
      });

      assert.equal(result.isLate, false);
      assert.equal(result.status, "INSPECTION_WINDOW_ACTIVE");
      assert.notEqual(result.personalAgentAssistanceNotes, null);
    });
  });

  describe("4. Post-Payout vs Pre-Payout Dispute Resolution Handling", () => {
    it("creates an outstanding supplier repayment debt record when PayPal rules BUYER_FAVORED after payout settlement", () => {
      const resolution = adapter.processDisputeResolution({
        disputeId: DISPUTE_ID,
        clanId: CLAN_ID,
        memberId: MEMBER_ID,
        captureId: CAPTURE_ID,
        supplierEmail: SUPPLIER_EMAIL,
        disputeAmount: 116.0,
        resolution: "BUYER_FAVORED",
        payoutAlreadySettled: true,
        debtId: "debt_20261026_002",
      });

      assert.equal(resolution.disputeId, DISPUTE_ID);
      assert.equal(resolution.resolution, "BUYER_FAVORED");
      assert.equal(resolution.payoutAlreadySettled, true);
      assert.equal(resolution.debtCreated, true);
      assert.notEqual(resolution.debtRecord, null);

      const debt = resolution.debtRecord!;
      assert.equal(debt.id, "debt_20261026_002");
      assert.equal(debt.clanId, CLAN_ID);
      assert.equal(debt.memberId, MEMBER_ID);
      assert.equal(debt.captureId, CAPTURE_ID);
      assert.equal(debt.supplierEmail, SUPPLIER_EMAIL);
      assert.equal(debt.disputeAmount, 116.0);
      assert.equal(debt.debtAmount, 116.0);
      assert.equal(debt.status, "OUTSTANDING");
      assert.equal(debt.repaidAmount, 0);

      // Verify record is persisted in storage
      const persisted = repaymentStorage.getById("debt_20261026_002");
      assert.notEqual(persisted, null);
      assert.equal(persisted?.supplierEmail, SUPPLIER_EMAIL);
      assert.equal(persisted?.debtAmount, 116.0);
    });

    it("does NOT create supplier repayment debt when PayPal rules BUYER_FAVORED prior to payout settlement", () => {
      const disputeIdPrePayout = "PP-D-88234912";

      const resolution = adapter.processDisputeResolution({
        disputeId: disputeIdPrePayout,
        clanId: CLAN_ID,
        memberId: MEMBER_ID,
        captureId: CAPTURE_ID,
        supplierEmail: SUPPLIER_EMAIL,
        disputeAmount: 116.0,
        resolution: "BUYER_FAVORED",
        payoutAlreadySettled: false, // Escrow hold is still available
      });

      assert.equal(resolution.disputeId, disputeIdPrePayout);
      assert.equal(resolution.debtCreated, false);
      assert.equal(resolution.debtRecord, null);
      assert.match(resolution.message, /settled from held escrow balance/);

      // Verify no debt was persisted
      const persisted = repaymentStorage.getByDisputeId(disputeIdPrePayout);
      assert.equal(persisted, null);
    });

    it("does NOT create supplier repayment debt when dispute rules SELLER_FAVORED", () => {
      const sellerFavoredDispute = "PP-D-77112233";

      const resolution = adapter.processDisputeResolution({
        disputeId: sellerFavoredDispute,
        clanId: CLAN_ID,
        memberId: MEMBER_ID,
        captureId: CAPTURE_ID,
        supplierEmail: SUPPLIER_EMAIL,
        disputeAmount: 116.0,
        resolution: "SELLER_FAVORED",
        payoutAlreadySettled: true,
      });

      assert.equal(resolution.resolution, "SELLER_FAVORED");
      assert.equal(resolution.debtCreated, false);
      assert.equal(resolution.debtRecord, null);
      assert.match(resolution.message, /resolved in seller's favor/);

      const persisted = repaymentStorage.getByDisputeId(sellerFavoredDispute);
      assert.equal(persisted, null);
    });
  });

  describe("5. Single-Refund Invariant Enforcement", () => {
    it("strictly blocks in-app refund when a PayPal dispute refund already exists for the capture", () => {
      const existingRefunds: ExistingRefund[] = [
        {
          id: "ref_dispute_awarded_01",
          captureId: CAPTURE_ID,
          disputeId: DISPUTE_ID,
          amount: 116.0,
          source: "PAYPAL_DISPUTE",
          isDisputeRefund: true,
          status: "COMPLETED",
        },
      ];

      assert.throws(
        () => adapter.assertCanRefund(CAPTURE_ID, 116.0, existingRefunds),
        (err: Error) => {
          assert(err instanceof SingleRefundViolationError);
          assert.equal(err.captureId, CAPTURE_ID);
          assert.equal(err.disputeId, DISPUTE_ID);
          assert.match(err.message, /single-refund invariant/);
          return true;
        }
      );
    });

    it("blocks refund when existing dispute refund has isDisputeRefund flag without explicit disputeId", () => {
      const existingRefunds: ExistingRefund[] = [
        {
          refundId: "ref_55B9182374619",
          captureId: CAPTURE_ID,
          amount: 116.0,
          isDisputeRefund: true,
          type: "DISPUTE_REFUND",
        },
      ];

      assert.throws(
        () => assertCanRefund(CAPTURE_ID, 116.0, existingRefunds),
        (err: Error) => {
          assert(err instanceof SingleRefundViolationError);
          assert.equal(err.captureId, CAPTURE_ID);
          return true;
        }
      );
    });

    it("allows in-app refund when no prior PayPal dispute refund exists for the capture", () => {
      const existingRefunds: ExistingRefund[] = [];

      assert.doesNotThrow(() => {
        adapter.assertCanRefund(CAPTURE_ID, 116.0, existingRefunds);
      });
    });

    it("ignores dispute refunds belonging to a different capture ID", () => {
      const existingRefunds: ExistingRefund[] = [
        {
          id: "ref_other_capture",
          captureId: "98J71625KL119932V", // Different capture ID
          disputeId: "PP-D-55556666",
          amount: 250.0,
          source: "PAYPAL_DISPUTE",
          isDisputeRefund: true,
        },
      ];

      assert.doesNotThrow(() => {
        adapter.assertCanRefund(CAPTURE_ID, 116.0, existingRefunds);
      });
    });

    it("rejects non-positive proposed refund amounts", () => {
      assert.throws(() => adapter.assertCanRefund(CAPTURE_ID, 0, []), /greater than zero/);
      assert.throws(() => adapter.assertCanRefund(CAPTURE_ID, -50.0, []), /greater than zero/);
    });
  });

  describe("6. Architectural Boundary Verification", () => {
    it("ensures late-dispute adapter contains zero @paypal/ imports or external paypal urls", () => {
      const adapterPath = path.resolve(__dirname, "../src/adapter/late-dispute.adapter.ts");
      const storagePath = path.resolve(__dirname, "../src/storage/repayment.storage.ts");

      const adapterCode = fs.readFileSync(adapterPath, "utf8");
      const storageCode = fs.readFileSync(storagePath, "utf8");

      assert.doesNotMatch(adapterCode, /@paypal\//, "Adapter must not import from @paypal/*");
      assert.doesNotMatch(
        adapterCode,
        /api-m\.sandbox\.paypal\.com/,
        "Adapter must not reference paypal api endpoints directly"
      );

      assert.doesNotMatch(storageCode, /@paypal\//, "Storage must not import from @paypal/*");
      assert.doesNotMatch(
        storageCode,
        /api-m\.sandbox\.paypal\.com/,
        "Storage must not reference paypal api endpoints directly"
      );
    });
  });
});
