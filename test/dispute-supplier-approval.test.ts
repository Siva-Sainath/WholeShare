import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  DisputeApprovalStorage,
  type DisputeOfferApproval,
} from "../src/storage/dispute-approval.storage.ts";
import {
  PayPalMoneyGateway,
  DisputeOfferUnauthorizedError,
  DisputeOfferAmountExceededError,
  DisputeResponseOptionUnavailableError,
} from "../src/gateway/PayPalMoneyGateway.ts";
import { IdempotencyStorage } from "../src/storage/idempotency.storage.ts";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const TEST_DIR = path.resolve(__dirname, "temp-dispute-test");

describe("Ticket 10a: Formal PayPal Dispute Mediation & Supplier-Approved Offers", () => {
  let disputeStorage: DisputeApprovalStorage;
  let idempotencyStorage: IdempotencyStorage;
  let gateway: PayPalMoneyGateway;

  const testDisputePath = path.join(TEST_DIR, "test-disputes.json");
  const testIdempotencyPath = path.join(TEST_DIR, "test-idempotency.json");

  beforeEach(() => {
    if (!fs.existsSync(TEST_DIR)) {
      fs.mkdirSync(TEST_DIR, { recursive: true });
    }
    fs.writeFileSync(testDisputePath, JSON.stringify([], null, 2), "utf8");
    fs.writeFileSync(testIdempotencyPath, JSON.stringify([], null, 2), "utf8");

    disputeStorage = new DisputeApprovalStorage(testDisputePath);
    idempotencyStorage = new IdempotencyStorage(testIdempotencyPath);

    gateway = new PayPalMoneyGateway(undefined, idempotencyStorage);
  });

  afterEach(() => {
    if (fs.existsSync(TEST_DIR)) {
      fs.rmSync(TEST_DIR, { recursive: true, force: true });
    }
  });

  describe("1. DisputeOfferApproval Storage Invariants", () => {
    it("creates, stores, and retrieves dispute offer approvals", () => {
      const approval: DisputeOfferApproval = {
        id: "approval-1",
        disputeId: "PP-R-OOA-10194658",
        clanId: "clan-austin-organic-flour-01",
        memberId: "buyer-maria-bakery",
        captureId: "74H63527HK822241U",
        supplierEmail: "sb-t43fur53471579@business.example.com",
        disputeAmount: 100.0,
        claimedAmount: 100.0,
        approvedOfferAmount: 100.0,
        offerType: "REFUND",
        status: "PENDING",
        reviewedAt: null,
        createdAt: new Date().toISOString(),
      };

      disputeStorage.create(approval);
      const retrieved = disputeStorage.getById("approval-1");
      assert.notEqual(retrieved, null);
      assert.equal(retrieved?.disputeId, "PP-R-OOA-10194658");
      assert.equal(retrieved?.status, "PENDING");
    });

    it("rejects duplicate approval IDs", () => {
      const approval: DisputeOfferApproval = {
        id: "approval-dup",
        disputeId: "PP-R-OOA-10194658",
        clanId: "clan-austin-organic-flour-01",
        memberId: "buyer-maria-bakery",
        captureId: "74H63527HK822241U",
        supplierEmail: "sb-t43fur53471579@business.example.com",
        disputeAmount: 100.0,
        claimedAmount: 100.0,
        approvedOfferAmount: 100.0,
        offerType: "REFUND",
        status: "PENDING",
        reviewedAt: null,
        createdAt: new Date().toISOString(),
      };

      disputeStorage.create(approval);
      assert.throws(() => disputeStorage.create(approval), /already exists/);
    });
  });

  describe("2. Gateway Dispute Offer Authorization Invariants", () => {
    it("strictly refuses submitDisputeOffer when no supplier approval record exists", async () => {
      await assert.rejects(
        () =>
          gateway.submitDisputeOffer({
            disputeId: "PP-R-NONEXISTENT-9999",
            clanId: "clan-austin-organic-flour-01",
            memberId: "buyer-maria-bakery",
            customDisputeApprovalStorage: disputeStorage,
          }),
        (err: Error) => {
          assert(err instanceof DisputeOfferUnauthorizedError);
          assert.equal(err.code, "NO_APPROVAL_RECORD");
          return true;
        }
      );
    });

    it("strictly refuses submitDisputeOffer when supplier status is PENDING or DECLINED", async () => {
      disputeStorage.create({
        id: "approval-pending",
        disputeId: "PP-R-OOA-10194658",
        clanId: "clan-austin-organic-flour-01",
        memberId: "buyer-maria-bakery",
        captureId: "74H63527HK822241U",
        supplierEmail: "sb-t43fur53471579@business.example.com",
        disputeAmount: 100.0,
        claimedAmount: 100.0,
        approvedOfferAmount: 100.0,
        offerType: "REFUND",
        status: "PENDING",
        reviewedAt: null,
        createdAt: new Date().toISOString(),
      });

      await assert.rejects(
        () =>
          gateway.submitDisputeOffer({
            disputeId: "PP-R-OOA-10194658",
            clanId: "clan-austin-organic-flour-01",
            memberId: "buyer-maria-bakery",
            customDisputeApprovalStorage: disputeStorage,
          }),
        (err: Error) => {
          assert(err instanceof DisputeOfferUnauthorizedError);
          assert.equal(err.code, "APPROVAL_NOT_GRANTED");
          return true;
        }
      );
    });

    it("strictly refuses submitDisputeOffer when approved amount exceeds capped claim amount ($116.00 cap)", async () => {
      disputeStorage.create({
        id: "approval-exceeded",
        disputeId: "PP-R-OOA-10194658",
        clanId: "clan-austin-organic-flour-01",
        memberId: "buyer-maria-bakery",
        captureId: "74H63527HK822241U",
        supplierEmail: "sb-t43fur53471579@business.example.com",
        disputeAmount: 100.0,
        claimedAmount: 100.0,
        approvedOfferAmount: 250.0, // Exceeds $100 claim!
        offerType: "REFUND",
        status: "APPROVED",
        reviewedAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
      });

      await assert.rejects(
        () =>
          gateway.submitDisputeOffer({
            disputeId: "PP-R-OOA-10194658",
            clanId: "clan-austin-organic-flour-01",
            memberId: "buyer-maria-bakery",
            customDisputeApprovalStorage: disputeStorage,
          }),
        (err: Error) => {
          assert(err instanceof DisputeOfferAmountExceededError);
          assert.equal(err.offeredAmount, 250.0);
          assert.equal(err.cappedAmount, 100.0);
          return true;
        }
      );
    });

    it("strictly refuses submitDisputeOffer when dispute permissions do not permit make_offer", async () => {
      disputeStorage.create({
        id: "approval-valid",
        disputeId: "PP-R-CLOSED-12345",
        clanId: "clan-austin-organic-flour-01",
        memberId: "buyer-maria-bakery",
        captureId: "74H63527HK822241U",
        supplierEmail: "sb-t43fur53471579@business.example.com",
        disputeAmount: 100.0,
        claimedAmount: 100.0,
        approvedOfferAmount: 100.0,
        offerType: "REFUND",
        status: "APPROVED",
        reviewedAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
      });

      // Pass dispute override showing dispute has already resolved and no make_offer permitted
      await assert.rejects(
        () =>
          gateway.submitDisputeOffer({
            disputeId: "PP-R-CLOSED-12345",
            clanId: "clan-austin-organic-flour-01",
            memberId: "buyer-maria-bakery",
            customDisputeApprovalStorage: disputeStorage,
            disputeDetailsOverride: {
              dispute_id: "PP-R-CLOSED-12345",
              status: "RESOLVED",
              dispute_life_cycle_stage: "RESOLVED",
              allowed_response_options: {},
              links: [],
            },
          }),
        (err: Error) => {
          assert(err instanceof DisputeResponseOptionUnavailableError);
          assert.equal(err.disputeId, "PP-R-CLOSED-12345");
          return true;
        }
      );
    });
  });
});
