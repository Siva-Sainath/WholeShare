import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  ClaimsStorage,
} from "../src/storage/claims.storage.ts";
import {
  DeliveryStorage,
} from "../src/storage/delivery.storage.ts";
import {
  ClaimsAdapter,
  BuyerApprovalRequiredError,
  ClaimAlreadySettledError,
  InspectionWindowExpiredError,
  InvalidCounterAmountError,
} from "../src/adapter/claims.adapter.ts";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const TEST_DIR = path.resolve(__dirname, "temp-claims-test");

describe("Ticket 09: In-App Damage Claim Flow & Capped Escrow Refunds", () => {
  let claimsStorage: ClaimsStorage;
  let deliveryStorage: DeliveryStorage;
  let claimsAdapter: ClaimsAdapter;

  const testClaimsPath = path.join(TEST_DIR, "test-claims.json");
  const testDeliveryPath = path.join(TEST_DIR, "test-delivery.json");

  beforeEach(() => {
    if (!fs.existsSync(TEST_DIR)) {
      fs.mkdirSync(TEST_DIR, { recursive: true });
    }
    fs.writeFileSync(testClaimsPath, JSON.stringify([], null, 2), "utf8");
    fs.writeFileSync(testDeliveryPath, JSON.stringify([], null, 2), "utf8");

    claimsStorage = new ClaimsStorage(testClaimsPath);
    deliveryStorage = new DeliveryStorage(testDeliveryPath);
    claimsAdapter = new ClaimsAdapter(claimsStorage, deliveryStorage);
  });

  afterEach(() => {
    if (fs.existsSync(TEST_DIR)) {
      fs.rmSync(TEST_DIR, { recursive: true, force: true });
    }
  });

  describe("1. Claim Intake & Deterministic Capping", () => {
    it("caps refund to damagedUnits * unitPrice when below order value ($116.00)", () => {
      const claim = claimsAdapter.intakeClaim({
        clanId: "clan-austin-organic-flour-01",
        memberId: "buyer-maria-bakery",
        orderId: "39J81892GY6122912",
        captureId: "74H63527HK822241U",
        damagedUnits: 20,
        unitPrice: 5.8,
        orderValue: 1160.0,
        evidence: {
          photoUrls: ["https://storage.syndicatepay.internal/maria-punctured-bag.jpg"],
          description: "20 bags punctured during freight transit",
        },
      });

      assert.equal(claim.claimedAmount, 116.0);
      assert.equal(claim.status, "DRAFT");
      assert.equal(claim.buyerApprovedAt, null);
    });

    it("caps refund to order value when damage calculation exceeds order value", () => {
      const claim = claimsAdapter.intakeClaim({
        clanId: "clan-austin-organic-flour-01",
        memberId: "buyer-maria-bakery",
        orderId: "39J81892GY6122912",
        captureId: "74H63527HK822241U",
        damagedUnits: 500,
        unitPrice: 5.8,
        orderValue: 1160.0,
        evidence: {
          photoUrls: [],
          description: "Catastrophic damage",
        },
      });

      assert.equal(claim.claimedAmount, 1160.0);
    });

    it("rejects non-positive damaged unit counts", () => {
      assert.throws(
        () =>
          claimsAdapter.intakeClaim({
            clanId: "clan-austin-organic-flour-01",
            memberId: "buyer-maria-bakery",
            orderId: "39J81892GY6122912",
            captureId: "74H63527HK822241U",
            damagedUnits: 0,
            unitPrice: 5.8,
            orderValue: 1160.0,
            evidence: { photoUrls: [], description: "None" },
          }),
        /Damaged units must be greater than zero/
      );
    });
  });

  describe("2. 48-Hour Inspection Clock Enforcement", () => {
    it("allows claim intake when within active 48-hour inspection clock", () => {
      const futureTime = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
      deliveryStorage.upsert({
        id: "deliv-1",
        clanId: "clan-austin-organic-flour-01",
        memberId: "buyer-maria-bakery",
        trackingNumber: "1Z9999999999999999",
        carrierName: "UPS",
        supplierDeliveredAt: new Date().toISOString(),
        buyerDeliveredAt: new Date().toISOString(),
        inspectionWindowEndsAt: futureTime,
        source: "buyer",
        conditionNotes: null,
        createdAt: new Date().toISOString(),
      });

      const claim = claimsAdapter.intakeClaim({
        clanId: "clan-austin-organic-flour-01",
        memberId: "buyer-maria-bakery",
        orderId: "39J81892GY6122912",
        captureId: "74H63527HK822241U",
        damagedUnits: 20,
        unitPrice: 5.8,
        orderValue: 1160.0,
        evidence: { photoUrls: [], description: "Damaged bags" },
      });

      assert.equal(claim.claimedAmount, 116.0);
    });

    it("rejects claim intake when 48-hour inspection clock has expired", () => {
      const pastTime = new Date(Date.now() - 3600 * 1000).toISOString();
      deliveryStorage.upsert({
        id: "deliv-1",
        clanId: "clan-austin-organic-flour-01",
        memberId: "buyer-maria-bakery",
        trackingNumber: "1Z9999999999999999",
        carrierName: "UPS",
        supplierDeliveredAt: new Date(Date.now() - 72 * 3600 * 1000).toISOString(),
        buyerDeliveredAt: new Date(Date.now() - 50 * 3600 * 1000).toISOString(),
        inspectionWindowEndsAt: pastTime,
        source: "buyer",
        conditionNotes: null,
        createdAt: new Date(Date.now() - 72 * 3600 * 1000).toISOString(),
      });

      assert.throws(
        () =>
          claimsAdapter.intakeClaim({
            clanId: "clan-austin-organic-flour-01",
            memberId: "buyer-maria-bakery",
            orderId: "39J81892GY6122912",
            captureId: "74H63527HK822241U",
            damagedUnits: 20,
            unitPrice: 5.8,
            orderValue: 1160.0,
            evidence: { photoUrls: [], description: "Late claim" },
          }),
        InspectionWindowExpiredError
      );
    });
  });

  describe("3. Explicit Buyer Review & Approval Gate", () => {
    it("strictly blocks supplier response before buyer approves claim", async () => {
      const claim = claimsAdapter.intakeClaim({
        clanId: "clan-austin-organic-flour-01",
        memberId: "buyer-maria-bakery",
        orderId: "39J81892GY6122912",
        captureId: "74H63527HK822241U",
        damagedUnits: 20,
        unitPrice: 5.8,
        orderValue: 1160.0,
        evidence: { photoUrls: [], description: "Unapproved claim" },
      });

      await assert.rejects(
        () =>
          claimsAdapter.respondToClaim({
            claimId: claim.claimId,
            action: "ACCEPT",
          }),
        BuyerApprovalRequiredError
      );
    });

    it("allows buyer to review and approve draft claim", () => {
      const claim = claimsAdapter.intakeClaim({
        clanId: "clan-austin-organic-flour-01",
        memberId: "buyer-maria-bakery",
        orderId: "39J81892GY6122912",
        captureId: "74H63527HK822241U",
        damagedUnits: 20,
        unitPrice: 5.8,
        orderValue: 1160.0,
        evidence: { photoUrls: [], description: "Review requested" },
      });

      const approved = claimsAdapter.approveClaimByBuyer(
        claim.claimId,
        "buyer-maria-bakery"
      );

      assert.equal(approved.status, "BUYER_APPROVED");
      assert.notEqual(approved.buyerApprovedAt, null);
    });

    it("rejects unauthorized member attempting to approve buyer's claim", () => {
      const claim = claimsAdapter.intakeClaim({
        clanId: "clan-austin-organic-flour-01",
        memberId: "buyer-maria-bakery",
        orderId: "39J81892GY6122912",
        captureId: "74H63527HK822241U",
        damagedUnits: 20,
        unitPrice: 5.8,
        orderValue: 1160.0,
        evidence: { photoUrls: [], description: "Review requested" },
      });

      assert.throws(
        () =>
          claimsAdapter.approveClaimByBuyer(claim.claimId, "buyer-other-member"),
        /is not authorized to approve claim/
      );
    });
  });

  describe("4. Supplier Response: Counter & Rejection", () => {
    it("handles supplier counter-offer within claim cap", async () => {
      const claim = claimsAdapter.intakeClaim({
        clanId: "clan-austin-organic-flour-01",
        memberId: "buyer-maria-bakery",
        orderId: "39J81892GY6122912",
        captureId: "74H63527HK822241U",
        damagedUnits: 20,
        unitPrice: 5.8,
        orderValue: 1160.0,
        evidence: { photoUrls: [], description: "Water damaged" },
        autoBuyerApprove: true,
      });

      const countered = await claimsAdapter.respondToClaim({
        claimId: claim.claimId,
        action: "COUNTER",
        counterAmount: 58.0,
        notes: "Offering 50% credit for partially usable flour",
      });

      assert.equal(countered.status, "SUPPLIER_COUNTERED");
      assert.equal(countered.supplierResponse?.counterAmount, 58.0);
    });

    it("rejects counter-offer exceeding the capped claim amount", async () => {
      const claim = claimsAdapter.intakeClaim({
        clanId: "clan-austin-organic-flour-01",
        memberId: "buyer-maria-bakery",
        orderId: "39J81892GY6122912",
        captureId: "74H63527HK822241U",
        damagedUnits: 20,
        unitPrice: 5.8,
        orderValue: 1160.0,
        evidence: { photoUrls: [], description: "Damage" },
        autoBuyerApprove: true,
      });

      await assert.rejects(
        () =>
          claimsAdapter.respondToClaim({
            claimId: claim.claimId,
            action: "COUNTER",
            counterAmount: 150.0,
          }),
        InvalidCounterAmountError
      );
    });

    it("handles supplier rejection transition", async () => {
      const claim = claimsAdapter.intakeClaim({
        clanId: "clan-austin-organic-flour-01",
        memberId: "buyer-maria-bakery",
        orderId: "39J81892GY6122912",
        captureId: "74H63527HK822241U",
        damagedUnits: 20,
        unitPrice: 5.8,
        orderValue: 1160.0,
        evidence: { photoUrls: [], description: "Packaging intact" },
        autoBuyerApprove: true,
      });

      const rejected = await claimsAdapter.respondToClaim({
        claimId: claim.claimId,
        action: "REJECT",
        notes: "Inspection photos show standard handling wear",
      });

      assert.equal(rejected.status, "REJECTED");
    });
  });

  describe("5. Supplier Acceptance & Single-Refund Invariant", () => {
    it("accepts claim, executes escrow refund, reduces supplier payout, and sets status to SETTLED", async () => {
      const claim = claimsAdapter.intakeClaim({
        clanId: "clan-austin-organic-flour-01",
        memberId: "buyer-maria-bakery",
        orderId: "39J81892GY6122912",
        captureId: "74H63527HK822241U",
        damagedUnits: 20,
        unitPrice: 5.8,
        orderValue: 1160.0,
        evidence: {
          photoUrls: ["https://storage.syndicatepay.internal/maria-punctured-bag.jpg"],
          description: "20 bags punctured during freight transit",
        },
        autoBuyerApprove: true,
      });

      let executedRefundParams: Record<string, unknown> | null = null;
      const settled = await claimsAdapter.respondToClaim({
        claimId: claim.claimId,
        action: "ACCEPT",
        notes: "Supplier accepted packaging damage claim",
        executeRefundFn: async (params) => {
          executedRefundParams = params;
          return {
            refundId: "REFUND-REAL-TXN-12345",
            rawResponse: { id: "REFUND-REAL-TXN-12345", status: "COMPLETED" },
          };
        },
      });

      assert.equal(settled.status, "SETTLED");
      assert.equal(settled.agreedRefundAmount, 116.0);
      assert.equal(settled.refundId, "REFUND-REAL-TXN-12345");
      assert.equal(settled.reducedSupplierPayout, 1044.0);
      assert.notEqual(executedRefundParams, null);
    });

    it("strictly prevents duplicate refund execution on already settled claim (Single-Refund Invariant)", async () => {
      const claim = claimsAdapter.intakeClaim({
        clanId: "clan-austin-organic-flour-01",
        memberId: "buyer-maria-bakery",
        orderId: "39J81892GY6122912",
        captureId: "74H63527HK822241U",
        damagedUnits: 20,
        unitPrice: 5.8,
        orderValue: 1160.0,
        evidence: { photoUrls: [], description: "Damage" },
        autoBuyerApprove: true,
      });

      await claimsAdapter.respondToClaim({
        claimId: claim.claimId,
        action: "ACCEPT",
        executeRefundFn: async () => ({
          refundId: "REFUND-FIRST-TIME",
        }),
      });

      await assert.rejects(
        () =>
          claimsAdapter.respondToClaim({
            claimId: claim.claimId,
            action: "ACCEPT",
            executeRefundFn: async () => ({
              refundId: "REFUND-SECOND-TIME",
            }),
          }),
        ClaimAlreadySettledError
      );
    });
  });
});
