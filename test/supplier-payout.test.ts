import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  SettlementAdapter,
  type MemberSettlementEvaluation,
  type AccountingWebhookPayload,
} from "../src/adapter/settlement.adapter.ts";
import {
  DeliveryStorage,
  type DeliveryRecord,
} from "../src/storage/delivery.storage.ts";
import {
  ClaimsStorage,
  type DamageClaimRecord,
} from "../src/storage/claims.storage.ts";
import {
  DisputeApprovalStorage,
  type DisputeOfferApproval,
} from "../src/storage/dispute-approval.storage.ts";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const TEST_DIR = path.resolve(__dirname, "temp-settlement-test");

describe("Ticket 11: Per-Member Supplier Payouts & Settlement Integration", () => {
  let deliveryStorage: DeliveryStorage;
  let claimsStorage: ClaimsStorage;
  let disputeApprovalStorage: DisputeApprovalStorage;
  let settlementAdapter: SettlementAdapter;

  const testDeliveryPath = path.join(TEST_DIR, "test-delivery.json");
  const testClaimsPath = path.join(TEST_DIR, "test-claims.json");
  const testDisputesPath = path.join(TEST_DIR, "test-disputes.json");

  beforeEach(() => {
    if (!fs.existsSync(TEST_DIR)) {
      fs.mkdirSync(TEST_DIR, { recursive: true });
    }
    fs.writeFileSync(testDeliveryPath, JSON.stringify([], null, 2), "utf8");
    fs.writeFileSync(testClaimsPath, JSON.stringify([], null, 2), "utf8");
    fs.writeFileSync(testDisputesPath, JSON.stringify([], null, 2), "utf8");

    deliveryStorage = new DeliveryStorage(testDeliveryPath);
    claimsStorage = new ClaimsStorage(testClaimsPath);
    disputeApprovalStorage = new DisputeApprovalStorage(testDisputesPath);

    settlementAdapter = new SettlementAdapter(
      deliveryStorage,
      claimsStorage,
      disputeApprovalStorage
    );
  });

  afterEach(() => {
    if (fs.existsSync(TEST_DIR)) {
      fs.rmSync(TEST_DIR, { recursive: true, force: true });
    }
  });

  describe("1. Hold Rule: Active 48h Inspection Window", () => {
    it("strictly holds payout when 48-hour inspection countdown is still active", () => {
      const now = new Date("2026-10-26T12:00:00.000Z");
      const inspectionEndsAt = new Date("2026-10-27T12:00:00.000Z").toISOString(); // 24h in future

      const deliveryRecord: DeliveryRecord = {
        id: "del_clan-austin-organic-flour-01_buyer-maria-bakery",
        clanId: "clan-austin-organic-flour-01",
        memberId: "buyer-maria-bakery",
        trackingNumber: "1Z9999999999999999",
        carrierName: "UPS",
        supplierDeliveredAt: "2026-10-25T12:00:00.000Z",
        buyerDeliveredAt: "2026-10-25T12:00:00.000Z",
        inspectionWindowEndsAt: inspectionEndsAt,
        source: "supplier",
        conditionNotes: null,
        createdAt: "2026-10-25T12:00:00.000Z",
      };
      deliveryStorage.upsert(deliveryRecord);

      const evaluation = settlementAdapter.evaluateMemberSettlement({
        clanId: "clan-austin-organic-flour-01",
        memberId: "buyer-maria-bakery",
        orderId: "39J81892GY6122912",
        captureId: "74H63527HK822241U",
        grossCaptured: 1160.0,
        now,
      });

      assert.equal(evaluation.memberId, "buyer-maria-bakery");
      assert.equal(evaluation.orderId, "39J81892GY6122912");
      assert.equal(evaluation.captureId, "74H63527HK822241U");
      assert.equal(evaluation.inspectionWindowExpired, false);
      assert.equal(evaluation.hasOpenDispute, false);
      assert.equal(evaluation.isReadyForPayout, false);
      assert.equal(evaluation.holdReason, "Inspection window still active");
      assert.equal(evaluation.grossCaptured, 1160.0);
      assert.equal(evaluation.acceptedRefunds, 0);
      assert.equal(evaluation.netPayoutShare, 1160.0);
    });

    it("holds payout when delivery record is missing or confirmation is pending", () => {
      const now = new Date("2026-10-26T12:00:00.000Z");

      const evaluation = settlementAdapter.evaluateMemberSettlement({
        clanId: "clan-austin-organic-flour-01",
        memberId: "buyer-chen-baking-co",
        orderId: "50K92903HZ7233023",
        captureId: "85J74638JL933352V",
        grossCaptured: 580.0,
        now,
      });

      assert.equal(evaluation.inspectionWindowExpired, false);
      assert.equal(evaluation.isReadyForPayout, false);
      assert.equal(evaluation.holdReason, "Inspection window still active");
    });
  });

  describe("2. Hold Rule: Open Dispute Held Even If 48h Clock Expired", () => {
    it("strictly holds payout when a formal dispute is under review even after inspection clock expired", () => {
      const now = new Date("2026-10-26T12:00:00.000Z");
      const inspectionEndsAt = new Date("2026-10-25T12:00:00.000Z").toISOString(); // 24h in past (expired)

      const deliveryRecord: DeliveryRecord = {
        id: "del_clan-austin-organic-flour-01_buyer-maria-bakery",
        clanId: "clan-austin-organic-flour-01",
        memberId: "buyer-maria-bakery",
        trackingNumber: "1Z9999999999999999",
        carrierName: "UPS",
        supplierDeliveredAt: "2026-10-23T12:00:00.000Z",
        buyerDeliveredAt: "2026-10-23T12:00:00.000Z",
        inspectionWindowEndsAt: inspectionEndsAt,
        source: "supplier",
        conditionNotes: null,
        createdAt: "2026-10-23T12:00:00.000Z",
      };
      deliveryStorage.upsert(deliveryRecord);

      // Create an active dispute in DisputeApprovalStorage
      const disputeApproval: DisputeOfferApproval = {
        id: "approval-dispute-maria-01",
        disputeId: "PP-R-OOA-10194658",
        clanId: "clan-austin-organic-flour-01",
        memberId: "buyer-maria-bakery",
        captureId: "74H63527HK822241U",
        supplierEmail: "sb-t43fur53471579@business.example.com",
        disputeAmount: 116.0,
        claimedAmount: 116.0,
        approvedOfferAmount: 116.0,
        offerType: "REFUND",
        status: "PENDING",
        supplierNotes: "Awaiting supplier formal mediation review",
        reviewedAt: null,
        createdAt: "2026-10-24T10:00:00.000Z",
      };
      disputeApprovalStorage.create(disputeApproval);

      const evaluation = settlementAdapter.evaluateMemberSettlement({
        clanId: "clan-austin-organic-flour-01",
        memberId: "buyer-maria-bakery",
        orderId: "39J81892GY6122912",
        captureId: "74H63527HK822241U",
        grossCaptured: 1160.0,
        now,
      });

      assert.equal(evaluation.inspectionWindowExpired, true);
      assert.equal(evaluation.hasOpenDispute, true);
      assert.equal(evaluation.isReadyForPayout, false);
      assert.equal(evaluation.holdReason, "Active dispute under review");
    });

    it("strictly holds payout when hasOpenDispute flag is explicitly set in parameters", () => {
      const now = new Date("2026-10-26T12:00:00.000Z");
      const inspectionEndsAt = new Date("2026-10-25T12:00:00.000Z").toISOString(); // Expired

      const deliveryRecord: DeliveryRecord = {
        id: "del_clan-austin-organic-flour-01_buyer-chen-baking-co",
        clanId: "clan-austin-organic-flour-01",
        memberId: "buyer-chen-baking-co",
        trackingNumber: "1Z8888888888888888",
        carrierName: "FedEx",
        supplierDeliveredAt: "2026-10-23T12:00:00.000Z",
        buyerDeliveredAt: "2026-10-23T12:00:00.000Z",
        inspectionWindowEndsAt: inspectionEndsAt,
        source: "supplier",
        conditionNotes: null,
        createdAt: "2026-10-23T12:00:00.000Z",
      };
      deliveryStorage.upsert(deliveryRecord);

      const evaluation = settlementAdapter.evaluateMemberSettlement({
        clanId: "clan-austin-organic-flour-01",
        memberId: "buyer-chen-baking-co",
        orderId: "50K92903HZ7233023",
        captureId: "85J74638JL933352V",
        grossCaptured: 580.0,
        now,
        hasOpenDispute: true,
      });

      assert.equal(evaluation.inspectionWindowExpired, true);
      assert.equal(evaluation.hasOpenDispute, true);
      assert.equal(evaluation.isReadyForPayout, false);
      assert.equal(evaluation.holdReason, "Active dispute under review");
    });
  });

  describe("3. Hold Rule: Unresolved In-App Claim", () => {
    it("holds payout when a claim is in DRAFT status", () => {
      const now = new Date("2026-10-26T12:00:00.000Z");
      const inspectionEndsAt = new Date("2026-10-25T12:00:00.000Z").toISOString();

      deliveryStorage.upsert({
        id: "del_clan-austin-organic-flour-01_buyer-maria-bakery",
        clanId: "clan-austin-organic-flour-01",
        memberId: "buyer-maria-bakery",
        trackingNumber: "1Z9999999999999999",
        carrierName: "UPS",
        supplierDeliveredAt: "2026-10-23T12:00:00.000Z",
        buyerDeliveredAt: "2026-10-23T12:00:00.000Z",
        inspectionWindowEndsAt: inspectionEndsAt,
        source: "supplier",
        conditionNotes: null,
        createdAt: "2026-10-23T12:00:00.000Z",
      });

      const claimRecord: DamageClaimRecord = {
        claimId: "claim-damage-draft-101",
        clanId: "clan-austin-organic-flour-01",
        memberId: "buyer-maria-bakery",
        orderId: "39J81892GY6122912",
        captureId: "74H63527HK822241U",
        damagedUnits: 20,
        unitPrice: 5.8,
        orderValue: 1160.0,
        claimedAmount: 116.0,
        evidence: { photoUrls: [], description: "20 punctured bags" },
        status: "DRAFT",
        buyerApprovedAt: null,
        supplierResponse: null,
        agreedRefundAmount: null,
        refundId: null,
        refundTransaction: null,
        reducedSupplierPayout: null,
        createdAt: "2026-10-24T10:00:00.000Z",
        updatedAt: "2026-10-24T10:00:00.000Z",
      };
      claimsStorage.create(claimRecord);

      const evaluation = settlementAdapter.evaluateMemberSettlement({
        clanId: "clan-austin-organic-flour-01",
        memberId: "buyer-maria-bakery",
        orderId: "39J81892GY6122912",
        captureId: "74H63527HK822241U",
        grossCaptured: 1160.0,
        now,
      });

      assert.equal(evaluation.inspectionWindowExpired, true);
      assert.equal(evaluation.isReadyForPayout, false);
      assert.equal(evaluation.holdReason, "Open in-app claim pending");
    });

    it("holds payout when a claim is in BUYER_APPROVED status awaiting supplier response", () => {
      const now = new Date("2026-10-26T12:00:00.000Z");
      const inspectionEndsAt = new Date("2026-10-25T12:00:00.000Z").toISOString();

      deliveryStorage.upsert({
        id: "del_clan-austin-organic-flour-01_buyer-maria-bakery",
        clanId: "clan-austin-organic-flour-01",
        memberId: "buyer-maria-bakery",
        trackingNumber: "1Z9999999999999999",
        carrierName: "UPS",
        supplierDeliveredAt: "2026-10-23T12:00:00.000Z",
        buyerDeliveredAt: "2026-10-23T12:00:00.000Z",
        inspectionWindowEndsAt: inspectionEndsAt,
        source: "supplier",
        conditionNotes: null,
        createdAt: "2026-10-23T12:00:00.000Z",
      });

      claimsStorage.create({
        claimId: "claim-damage-approved-102",
        clanId: "clan-austin-organic-flour-01",
        memberId: "buyer-maria-bakery",
        orderId: "39J81892GY6122912",
        captureId: "74H63527HK822241U",
        damagedUnits: 20,
        unitPrice: 5.8,
        orderValue: 1160.0,
        claimedAmount: 116.0,
        evidence: { photoUrls: [], description: "20 punctured bags" },
        status: "BUYER_APPROVED",
        buyerApprovedAt: "2026-10-24T12:00:00.000Z",
        supplierResponse: null,
        agreedRefundAmount: null,
        refundId: null,
        refundTransaction: null,
        reducedSupplierPayout: null,
        createdAt: "2026-10-24T10:00:00.000Z",
        updatedAt: "2026-10-24T12:00:00.000Z",
      });

      const evaluation = settlementAdapter.evaluateMemberSettlement({
        clanId: "clan-austin-organic-flour-01",
        memberId: "buyer-maria-bakery",
        orderId: "39J81892GY6122912",
        captureId: "74H63527HK822241U",
        grossCaptured: 1160.0,
        now,
      });

      assert.equal(evaluation.isReadyForPayout, false);
      assert.equal(evaluation.holdReason, "Open in-app claim pending");
    });

    it("holds payout when a claim is in SUPPLIER_COUNTERED status awaiting buyer acceptance", () => {
      const now = new Date("2026-10-26T12:00:00.000Z");
      const inspectionEndsAt = new Date("2026-10-25T12:00:00.000Z").toISOString();

      deliveryStorage.upsert({
        id: "del_clan-austin-organic-flour-01_buyer-maria-bakery",
        clanId: "clan-austin-organic-flour-01",
        memberId: "buyer-maria-bakery",
        trackingNumber: "1Z9999999999999999",
        carrierName: "UPS",
        supplierDeliveredAt: "2026-10-23T12:00:00.000Z",
        buyerDeliveredAt: "2026-10-23T12:00:00.000Z",
        inspectionWindowEndsAt: inspectionEndsAt,
        source: "supplier",
        conditionNotes: null,
        createdAt: "2026-10-23T12:00:00.000Z",
      });

      claimsStorage.create({
        claimId: "claim-damage-countered-103",
        clanId: "clan-austin-organic-flour-01",
        memberId: "buyer-maria-bakery",
        orderId: "39J81892GY6122912",
        captureId: "74H63527HK822241U",
        damagedUnits: 20,
        unitPrice: 5.8,
        orderValue: 1160.0,
        claimedAmount: 116.0,
        evidence: { photoUrls: [], description: "20 punctured bags" },
        status: "SUPPLIER_COUNTERED",
        buyerApprovedAt: "2026-10-24T12:00:00.000Z",
        supplierResponse: {
          action: "COUNTER",
          counterAmount: 58.0,
          notes: "Offering 50% credit for salvageable flour",
          respondedAt: "2026-10-24T14:00:00.000Z",
        },
        agreedRefundAmount: null,
        refundId: null,
        refundTransaction: null,
        reducedSupplierPayout: null,
        createdAt: "2026-10-24T10:00:00.000Z",
        updatedAt: "2026-10-24T14:00:00.000Z",
      });

      const evaluation = settlementAdapter.evaluateMemberSettlement({
        clanId: "clan-austin-organic-flour-01",
        memberId: "buyer-maria-bakery",
        orderId: "39J81892GY6122912",
        captureId: "74H63527HK822241U",
        grossCaptured: 1160.0,
        now,
      });

      assert.equal(evaluation.isReadyForPayout, false);
      assert.equal(evaluation.holdReason, "Open in-app claim pending");
    });
  });

  describe("4. Payout Eligibility: Expired Inspection Window & No Disputes", () => {
    it("releases member payout when 48h clock has expired and no disputes or claims exist", () => {
      const now = new Date("2026-10-26T12:00:00.000Z");
      const inspectionEndsAt = new Date("2026-10-25T12:00:00.000Z").toISOString();

      deliveryStorage.upsert({
        id: "del_clan-austin-organic-flour-01_buyer-maria-bakery",
        clanId: "clan-austin-organic-flour-01",
        memberId: "buyer-maria-bakery",
        trackingNumber: "1Z9999999999999999",
        carrierName: "UPS",
        supplierDeliveredAt: "2026-10-23T12:00:00.000Z",
        buyerDeliveredAt: "2026-10-23T12:00:00.000Z",
        inspectionWindowEndsAt: inspectionEndsAt,
        source: "supplier",
        conditionNotes: null,
        createdAt: "2026-10-23T12:00:00.000Z",
      });

      const evaluation = settlementAdapter.evaluateMemberSettlement({
        clanId: "clan-austin-organic-flour-01",
        memberId: "buyer-maria-bakery",
        orderId: "39J81892GY6122912",
        captureId: "74H63527HK822241U",
        grossCaptured: 1160.0,
        now,
      });

      assert.equal(evaluation.inspectionWindowExpired, true);
      assert.equal(evaluation.hasOpenDispute, false);
      assert.equal(evaluation.isReadyForPayout, true);
      assert.equal(evaluation.holdReason, undefined);
      assert.equal(evaluation.netPayoutShare, 1160.0);
    });
  });

  describe("5. Net Calculation: Deducting Accepted Damage Refund", () => {
    it("correctly deducts accepted damage refund from member payout ($1,160 - $116 = $1,044)", () => {
      const now = new Date("2026-10-26T12:00:00.000Z");
      const inspectionEndsAt = new Date("2026-10-25T12:00:00.000Z").toISOString();

      deliveryStorage.upsert({
        id: "del_clan-austin-organic-flour-01_buyer-maria-bakery",
        clanId: "clan-austin-organic-flour-01",
        memberId: "buyer-maria-bakery",
        trackingNumber: "1Z9999999999999999",
        carrierName: "UPS",
        supplierDeliveredAt: "2026-10-23T12:00:00.000Z",
        buyerDeliveredAt: "2026-10-23T12:00:00.000Z",
        inspectionWindowEndsAt: inspectionEndsAt,
        source: "supplier",
        conditionNotes: null,
        createdAt: "2026-10-23T12:00:00.000Z",
      });

      // Claim is resolved and SETTLED with $116.00 refund
      claimsStorage.create({
        claimId: "claim-damage-settled-201",
        clanId: "clan-austin-organic-flour-01",
        memberId: "buyer-maria-bakery",
        orderId: "39J81892GY6122912",
        captureId: "74H63527HK822241U",
        damagedUnits: 20,
        unitPrice: 5.8,
        orderValue: 1160.0,
        claimedAmount: 116.0,
        evidence: { photoUrls: [], description: "20 punctured bags" },
        status: "SETTLED",
        buyerApprovedAt: "2026-10-24T12:00:00.000Z",
        supplierResponse: {
          action: "ACCEPT",
          notes: "Approved $116 refund for damaged bags",
          respondedAt: "2026-10-24T13:00:00.000Z",
        },
        agreedRefundAmount: 116.0,
        refundId: "refund-tx-821931002",
        refundTransaction: { id: "refund-tx-821931002", status: "COMPLETED" },
        reducedSupplierPayout: 1044.0,
        createdAt: "2026-10-24T10:00:00.000Z",
        updatedAt: "2026-10-24T13:00:00.000Z",
      });

      const evaluation = settlementAdapter.evaluateMemberSettlement({
        clanId: "clan-austin-organic-flour-01",
        memberId: "buyer-maria-bakery",
        orderId: "39J81892GY6122912",
        captureId: "74H63527HK822241U",
        grossCaptured: 1160.0,
        now,
      });

      assert.equal(evaluation.inspectionWindowExpired, true);
      assert.equal(evaluation.hasOpenDispute, false);
      assert.equal(evaluation.isReadyForPayout, true);
      assert.equal(evaluation.holdReason, undefined);
      assert.equal(evaluation.grossCaptured, 1160.0);
      assert.equal(evaluation.acceptedRefunds, 116.0);
      assert.equal(evaluation.netPayoutShare, 1044.0);
    });

    it("correctly deducts accepted damage refund from member payout ($580 - $116 = $464)", () => {
      const now = new Date("2026-10-26T12:00:00.000Z");
      const inspectionEndsAt = new Date("2026-10-25T12:00:00.000Z").toISOString();

      deliveryStorage.upsert({
        id: "del_clan-austin-organic-flour-01_buyer-chen-baking-co",
        clanId: "clan-austin-organic-flour-01",
        memberId: "buyer-chen-baking-co",
        trackingNumber: "1Z8888888888888888",
        carrierName: "FedEx",
        supplierDeliveredAt: "2026-10-23T12:00:00.000Z",
        buyerDeliveredAt: "2026-10-23T12:00:00.000Z",
        inspectionWindowEndsAt: inspectionEndsAt,
        source: "supplier",
        conditionNotes: null,
        createdAt: "2026-10-23T12:00:00.000Z",
      });

      claimsStorage.create({
        claimId: "claim-damage-settled-202",
        clanId: "clan-austin-organic-flour-01",
        memberId: "buyer-chen-baking-co",
        orderId: "50K92903HZ7233023",
        captureId: "85J74638JL933352V",
        damagedUnits: 20,
        unitPrice: 5.8,
        orderValue: 580.0,
        claimedAmount: 116.0,
        evidence: { photoUrls: [], description: "20 punctured bags" },
        status: "SETTLED",
        buyerApprovedAt: "2026-10-24T12:00:00.000Z",
        supplierResponse: {
          action: "ACCEPT",
          notes: "Accepted $116 refund",
          respondedAt: "2026-10-24T13:00:00.000Z",
        },
        agreedRefundAmount: 116.0,
        refundId: "refund-tx-821931003",
        refundTransaction: { id: "refund-tx-821931003", status: "COMPLETED" },
        reducedSupplierPayout: 464.0,
        createdAt: "2026-10-24T10:00:00.000Z",
        updatedAt: "2026-10-24T13:00:00.000Z",
      });

      const evaluation = settlementAdapter.evaluateMemberSettlement({
        clanId: "clan-austin-organic-flour-01",
        memberId: "buyer-chen-baking-co",
        orderId: "50K92903HZ7233023",
        captureId: "85J74638JL933352V",
        grossCaptured: 580.0,
        now,
      });

      assert.equal(evaluation.inspectionWindowExpired, true);
      assert.equal(evaluation.hasOpenDispute, false);
      assert.equal(evaluation.isReadyForPayout, true);
      assert.equal(evaluation.holdReason, undefined);
      assert.equal(evaluation.grossCaptured, 580.0);
      assert.equal(evaluation.acceptedRefunds, 116.0);
      assert.equal(evaluation.netPayoutShare, 464.0);
    });

    it("accepts explicitly passed acceptedRefunds parameter overriding storage", () => {
      const now = new Date("2026-10-26T12:00:00.000Z");
      const inspectionEndsAt = new Date("2026-10-25T12:00:00.000Z").toISOString();

      deliveryStorage.upsert({
        id: "del_clan-austin-organic-flour-01_buyer-maria-bakery",
        clanId: "clan-austin-organic-flour-01",
        memberId: "buyer-maria-bakery",
        trackingNumber: "1Z9999999999999999",
        carrierName: "UPS",
        supplierDeliveredAt: "2026-10-23T12:00:00.000Z",
        buyerDeliveredAt: "2026-10-23T12:00:00.000Z",
        inspectionWindowEndsAt: inspectionEndsAt,
        source: "supplier",
        conditionNotes: null,
        createdAt: "2026-10-23T12:00:00.000Z",
      });

      const evaluation = settlementAdapter.evaluateMemberSettlement({
        clanId: "clan-austin-organic-flour-01",
        memberId: "buyer-maria-bakery",
        orderId: "39J81892GY6122912",
        captureId: "74H63527HK822241U",
        grossCaptured: 1160.0,
        acceptedRefunds: 116.0,
        now,
      });

      assert.equal(evaluation.isReadyForPayout, true);
      assert.equal(evaluation.grossCaptured, 1160.0);
      assert.equal(evaluation.acceptedRefunds, 116.0);
      assert.equal(evaluation.netPayoutShare, 1044.0);
    });

    it("evaluates member settlement using Developer 1 coalitionId, smeId, and integer cents", () => {
      const now = new Date("2026-10-26T12:00:00.000Z");
      const inspectionEndsAt = new Date("2026-10-25T12:00:00.000Z").toISOString();

      deliveryStorage.upsert({
        id: "del_coalition_flour_01_sme_artisan_tx",
        clanId: "coalition_flour_01",
        memberId: "sme_artisan_tx",
        trackingNumber: "1Z9999999999999999",
        carrierName: "UPS",
        supplierDeliveredAt: "2026-10-23T12:00:00.000Z",
        buyerDeliveredAt: "2026-10-23T12:00:00.000Z",
        inspectionWindowEndsAt: inspectionEndsAt,
        source: "supplier",
        conditionNotes: null,
        createdAt: "2026-10-23T12:00:00.000Z",
      });

      const evaluation = settlementAdapter.evaluateMemberSettlement({
        coalitionId: "coalition_flour_01",
        smeId: "sme_artisan_tx",
        orderId: "ORD-COALITION-99182",
        captureId: "CAP-COALITION-99182",
        grossCapturedCents: 116000,
        acceptedRefundsCents: 11600,
        now,
      });

      assert.equal(evaluation.memberId, "sme_artisan_tx");
      assert.equal(evaluation.isReadyForPayout, true);
      assert.equal(evaluation.grossCaptured, 1160.0);
      assert.equal(evaluation.acceptedRefunds, 116.0);
      assert.equal(evaluation.netPayoutShare, 1044.0);
    });
  });

  describe("6. Clan-Level Batch Settlement Evaluation", () => {
    it("partitions ready vs held members accurately across the entire Clan", () => {
      const now = new Date("2026-10-26T12:00:00.000Z");
      const pastWindow = new Date("2026-10-25T12:00:00.000Z").toISOString(); // Expired
      const futureWindow = new Date("2026-10-27T12:00:00.000Z").toISOString(); // Active

      // Member 1: Maria - Expired & Settled ($1,160 - $116 = $1,044) -> Ready
      deliveryStorage.upsert({
        id: "del_clan-01_buyer-maria-bakery",
        clanId: "clan-austin-organic-flour-01",
        memberId: "buyer-maria-bakery",
        trackingNumber: "1Z9999999999999991",
        carrierName: "UPS",
        supplierDeliveredAt: "2026-10-23T12:00:00.000Z",
        buyerDeliveredAt: "2026-10-23T12:00:00.000Z",
        inspectionWindowEndsAt: pastWindow,
        source: "supplier",
        conditionNotes: null,
        createdAt: "2026-10-23T12:00:00.000Z",
      });
      claimsStorage.create({
        claimId: "claim-settled-maria",
        clanId: "clan-austin-organic-flour-01",
        memberId: "buyer-maria-bakery",
        orderId: "ord-maria",
        captureId: "cap-maria",
        damagedUnits: 20,
        unitPrice: 5.8,
        orderValue: 1160.0,
        claimedAmount: 116.0,
        evidence: { photoUrls: [], description: "Punctured bags" },
        status: "SETTLED",
        buyerApprovedAt: "2026-10-24T12:00:00.000Z",
        supplierResponse: {
          action: "ACCEPT",
          notes: "Approved refund",
          respondedAt: "2026-10-24T13:00:00.000Z",
        },
        agreedRefundAmount: 116.0,
        refundId: "ref-maria",
        refundTransaction: null,
        reducedSupplierPayout: 1044.0,
        createdAt: "2026-10-24T10:00:00.000Z",
        updatedAt: "2026-10-24T13:00:00.000Z",
      });

      // Member 2: Chen - Expired, no claims ($580 - $0 = $580) -> Ready
      deliveryStorage.upsert({
        id: "del_clan-01_buyer-chen-baking-co",
        clanId: "clan-austin-organic-flour-01",
        memberId: "buyer-chen-baking-co",
        trackingNumber: "1Z9999999999999992",
        carrierName: "FedEx",
        supplierDeliveredAt: "2026-10-23T12:00:00.000Z",
        buyerDeliveredAt: "2026-10-23T12:00:00.000Z",
        inspectionWindowEndsAt: pastWindow,
        source: "supplier",
        conditionNotes: null,
        createdAt: "2026-10-23T12:00:00.000Z",
      });

      // Member 3: Sourdough - Active 48h window ($580) -> Held
      deliveryStorage.upsert({
        id: "del_clan-01_buyer-austin-sourdough",
        clanId: "clan-austin-organic-flour-01",
        memberId: "buyer-austin-sourdough",
        trackingNumber: "1Z9999999999999993",
        carrierName: "UPS",
        supplierDeliveredAt: "2026-10-25T12:00:00.000Z",
        buyerDeliveredAt: "2026-10-25T12:00:00.000Z",
        inspectionWindowEndsAt: futureWindow,
        source: "supplier",
        conditionNotes: null,
        createdAt: "2026-10-25T12:00:00.000Z",
      });

      // Member 4: Pastries - Expired, but open dispute ($580) -> Held
      deliveryStorage.upsert({
        id: "del_clan-01_buyer-atx-pastries",
        clanId: "clan-austin-organic-flour-01",
        memberId: "buyer-atx-pastries",
        trackingNumber: "1Z9999999999999994",
        carrierName: "UPS",
        supplierDeliveredAt: "2026-10-23T12:00:00.000Z",
        buyerDeliveredAt: "2026-10-23T12:00:00.000Z",
        inspectionWindowEndsAt: pastWindow,
        source: "supplier",
        conditionNotes: null,
        createdAt: "2026-10-23T12:00:00.000Z",
      });
      disputeApprovalStorage.create({
        id: "approval-dispute-pastries",
        disputeId: "PP-R-OOA-99887766",
        clanId: "clan-austin-organic-flour-01",
        memberId: "buyer-atx-pastries",
        captureId: "cap-pastries",
        supplierEmail: "supplier-central-milling@example.com",
        disputeAmount: 100.0,
        claimedAmount: 100.0,
        approvedOfferAmount: 100.0,
        offerType: "REFUND",
        status: "PENDING",
        supplierNotes: "Pending review",
        reviewedAt: null,
        createdAt: "2026-10-24T10:00:00.000Z",
      });

      const clanEvaluation = settlementAdapter.evaluateClanSettlement({
        clanId: "clan-austin-organic-flour-01",
        members: [
          {
            memberId: "buyer-maria-bakery",
            orderId: "ord-maria",
            captureId: "cap-maria",
            grossCaptured: 1160.0,
          },
          {
            memberId: "buyer-chen-baking-co",
            orderId: "ord-chen",
            captureId: "cap-chen",
            grossCaptured: 580.0,
          },
          {
            memberId: "buyer-austin-sourdough",
            orderId: "ord-sourdough",
            captureId: "cap-sourdough",
            grossCaptured: 580.0,
          },
          {
            memberId: "buyer-atx-pastries",
            orderId: "ord-pastries",
            captureId: "cap-pastries",
            grossCaptured: 580.0,
          },
        ],
        now,
      });

      assert.equal(clanEvaluation.clanId, "clan-austin-organic-flour-01");
      assert.equal(clanEvaluation.allMembersReady, false);
      assert.equal(clanEvaluation.evaluations.length, 4);
      assert.equal(clanEvaluation.readyMembers.length, 2);
      assert.equal(clanEvaluation.heldMembers.length, 2);
      assert.equal(clanEvaluation.totalGrossCaptured, 2900.0);
      assert.equal(clanEvaluation.totalAcceptedRefunds, 116.0);
      assert.equal(clanEvaluation.totalNetPayout, 1624.0); // 1044 + 580
    });
  });

  describe("7. Accounting Webhook Payload Formatting", () => {
    it("formats complete settlement payload for Zapier / accounting ingestion", () => {
      const timestamp = "2026-10-26T20:00:00.000Z";
      const payload: AccountingWebhookPayload =
        settlementAdapter.generateAccountingWebhookPayload({
          clanId: "clan-austin-organic-flour-01",
          supplierEmail: "supplier-central-milling@example.com",
          totalPaid: 1044.0,
          settledMembers: [
            {
              memberId: "buyer-maria-bakery",
              orderId: "39J81892GY6122912",
              captureId: "74H63527HK822241U",
              grossCaptured: 1160.0,
              acceptedRefunds: 116.0,
              netPayoutShare: 1044.0,
            },
          ],
          timestamp,
        });

      assert.equal(payload.event, "clan.settlement.completed");
      assert.equal(payload.eventType, "clan.settlement.completed");
      assert.equal(payload.clanId, "clan-austin-organic-flour-01");
      assert.equal(payload.supplierEmail, "supplier-central-milling@example.com");
      assert.equal(payload.currency, "USD");
      assert.equal(payload.totalPaid, 1044.0);
      assert.equal(payload.settledMembersCount, 1);
      assert.equal(payload.timestamp, timestamp);
      assert.equal(payload.settledMembers[0].memberId, "buyer-maria-bakery");
      assert.equal(payload.settledMembers[0].netPayoutShare, 1044.0);
    });

    it("formats partial settlement payload with custom event type when partial settlement occurs", () => {
      const payload = settlementAdapter.generateAccountingWebhookPayload({
        clanId: "clan-austin-organic-flour-01",
        supplierEmail: "supplier-central-milling@example.com",
        totalPaid: 464.0,
        settledMembers: [
          {
            memberId: "buyer-chen-baking-co",
            orderId: "50K92903HZ7233023",
            captureId: "85J74638JL933352V",
            grossCaptured: 580.0,
            acceptedRefunds: 116.0,
            netPayoutShare: 464.0,
          },
        ],
        event: "clan.settlement.partial",
      });

      assert.equal(payload.event, "clan.settlement.partial");
      assert.equal(payload.eventType, "clan.settlement.partial");
      assert.equal(payload.totalPaid, 464.0);
      assert.equal(payload.settledMembersCount, 1);
      assert.ok(payload.timestamp);
    });
  });
});
