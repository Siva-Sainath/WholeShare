import test, { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  calculateClaimCap,
  resolveEffectiveTier,
  calculateMemberShare,
  calculateHoldRelease,
  calculateClanSettlement,
  calculateReducedSupplierPayout,
  generateIdempotencyKey,
  canTransitionClanState,
  validateClanStateTransition,
  transitionClanState,
  canTransitionMemberState,
  validateMemberStateTransition,
  transitionMemberState,
  InvalidClanStateTransitionError,
  InvalidMemberStateTransitionError,
} from "../src/domain/money-math.ts";
import type {
  PricingTier,
  MemberPledge,
} from "../src/domain/money-math.ts";

describe("Domain Money Math & Pure Rules Verification", () => {
  const pricingTiers: PricingTier[] = [
    { minQuantity: 500, unitPrice: 7.20 },
    { minQuantity: 1000, unitPrice: 5.80 },
  ];

  describe("Claim Capping [min(damagedUnits * unitPrice, orderValue)]", () => {
    it("caps refund to damagedUnits * unitPrice when below order value", () => {
      const cap = calculateClaimCap(20, 5.80, 580.00);
      assert.equal(cap, 116.00);
    });

    it("caps refund to order value when damage calculation exceeds order value", () => {
      const cap = calculateClaimCap(120, 5.80, 580.00);
      assert.equal(cap, 580.00);
    });

    it("returns zero when zero units are damaged", () => {
      const cap = calculateClaimCap(0, 5.80, 580.00);
      assert.equal(cap, 0.00);
    });

    it("rounds damage amount to two decimal places", () => {
      const cap = calculateClaimCap(3, 7.333333, 100.00);
      assert.equal(cap, 22.00);
    });

    it("throws on negative input values", () => {
      assert.throws(() => calculateClaimCap(-1, 5.80, 580.00), /Damaged units cannot be negative/);
      assert.throws(() => calculateClaimCap(10, -5.80, 580.00), /Unit price cannot be negative/);
      assert.throws(() => calculateClaimCap(10, 5.80, -100.00), /Order value cannot be negative/);
    });
  });

  describe("Pro-Rata Fixture & Tier Unlocking Calculations", () => {
    it("Stage 1: 5 members pledge 100 bags each at Tier 1 ($720 hold each, $7.20/bag)", () => {
      const pledges: MemberPledge[] = [
        { memberId: "bakery-1", quantity: 100 },
        { memberId: "bakery-2", quantity: 100 },
        { memberId: "bakery-3", quantity: 100 },
        { memberId: "bakery-4", quantity: 100 },
        { memberId: "bakery-5", quantity: 100 },
      ];

      const settlement = calculateClanSettlement(pledges, pricingTiers);

      assert.equal(settlement.totalQuantity, 500);
      assert.equal(settlement.effectiveTier.minQuantity, 500);
      assert.equal(settlement.effectiveTier.unitPrice, 7.20);
      assert.equal(settlement.totalCaptured, 3600.00);
      assert.equal(settlement.grossSupplierPayout, 3600.00);

      settlement.memberShares.forEach((share) => {
        assert.equal(share.quantity, 100);
        assert.equal(share.unitPrice, 7.20);
        assert.equal(share.finalAmount, 720.00);
      });
    });

    it("Stage 2: 5 more members join (total 10 members, 1000 bags) unlocking Tier 2 ($580 each, $5.80/bag)", () => {
      const pledges: MemberPledge[] = [
        { memberId: "bakery-1", quantity: 100 },
        { memberId: "bakery-2", quantity: 100 },
        { memberId: "bakery-3", quantity: 100 },
        { memberId: "bakery-4", quantity: 100 },
        { memberId: "bakery-5", quantity: 100 },
        { memberId: "bakery-6", quantity: 100 },
        { memberId: "bakery-7", quantity: 100 },
        { memberId: "bakery-8", quantity: 100 },
        { memberId: "bakery-9", quantity: 100 },
        { memberId: "bakery-10", quantity: 100 },
      ];

      const settlement = calculateClanSettlement(pledges, pricingTiers, 7.20);

      assert.equal(settlement.totalQuantity, 1000);
      assert.equal(settlement.effectiveTier.minQuantity, 1000);
      assert.equal(settlement.effectiveTier.unitPrice, 5.80);
      assert.equal(settlement.totalCaptured, 5800.00);
      assert.equal(settlement.grossSupplierPayout, 5800.00);

      settlement.memberShares.forEach((share) => {
        assert.equal(share.quantity, 100);
        assert.equal(share.unitPrice, 5.80);
        assert.equal(share.finalAmount, 580.00);
        assert.equal(share.initialHoldAmount, 720.00);
        assert.equal(share.releasedHoldAmount, 140.00);
      });
    });

    it("calculates hold release amount cleanly", () => {
      const release = calculateHoldRelease(720.00, 580.00);
      assert.equal(release, 140.00);
    });

    it("throws when initial hold is less than captured amount", () => {
      assert.throws(() => calculateHoldRelease(500.00, 580.00), /Initial hold cannot be less than final captured amount/);
    });
  });

  describe("Supplier Payout Deduction After Accepted Claim Refund", () => {
    it("deducts accepted in-app claim refund from member payout ($580 - $116 = $464)", () => {
      const memberPayout = calculateReducedSupplierPayout(580.00, 116.00);
      assert.equal(memberPayout, 464.00);
    });

    it("deducts accepted in-app claim refund from Clan total supplier payout ($5800 - $116 = $5684)", () => {
      const clanPayout = calculateReducedSupplierPayout(5800.00, 116.00);
      assert.equal(clanPayout, 5684.00);
    });

    it("allows full refund leaving zero supplier payout", () => {
      const zeroPayout = calculateReducedSupplierPayout(580.00, 580.00);
      assert.equal(zeroPayout, 0.00);
    });

    it("throws when refund amount exceeds gross payout", () => {
      assert.throws(
        () => calculateReducedSupplierPayout(580.00, 600.00),
        /Refund amount cannot exceed gross supplier payout/
      );
    });

    it("throws on negative payout or refund amounts", () => {
      assert.throws(() => calculateReducedSupplierPayout(-580.00, 50.00), /Gross payout cannot be negative/);
      assert.throws(() => calculateReducedSupplierPayout(580.00, -50.00), /Refund amount cannot be negative/);
    });
  });

  describe("Deterministic Idempotency Key Generator", () => {
    it("produces deterministic SHA-256 hash for identical parameters", () => {
      const key1 = generateIdempotencyKey(
        "CAPTURE",
        "clan-austin-bakers-1",
        "member-maria-bakery",
        "FINAL_CAPTURE",
        "auth-txn-88192"
      );
      const key2 = generateIdempotencyKey(
        "CAPTURE",
        "clan-austin-bakers-1",
        "member-maria-bakery",
        "FINAL_CAPTURE",
        "auth-txn-88192"
      );

      assert.equal(typeof key1, "string");
      assert.equal(key1.length, 64);
      assert.equal(key1, key2);
    });

    it("produces distinct keys when any parameter varies", () => {
      const baseKey = generateIdempotencyKey("CAPTURE", "clan-1", "member-1", "LOCKED", "ref-1");
      const diffOp = generateIdempotencyKey("REFUND", "clan-1", "member-1", "LOCKED", "ref-1");
      const diffClan = generateIdempotencyKey("CAPTURE", "clan-2", "member-1", "LOCKED", "ref-1");
      const diffMember = generateIdempotencyKey("CAPTURE", "clan-1", "member-2", "LOCKED", "ref-1");
      const diffStage = generateIdempotencyKey("CAPTURE", "clan-1", "member-1", "SETTLED", "ref-1");
      const diffRef = generateIdempotencyKey("CAPTURE", "clan-1", "member-1", "LOCKED", "ref-2");

      const keySet = new Set([baseKey, diffOp, diffClan, diffMember, diffStage, diffRef]);
      assert.equal(keySet.size, 6);
    });

    it("validates required arguments", () => {
      assert.throws(
        () => generateIdempotencyKey("", "clan-1", "member-1", "stage-1", "ref-1"),
        /operationType, clanId, and stage are required/
      );
    });
  });

  describe("Clan State Machine Transitions", () => {
    it("validates normal lifecycle: FORMING -> THRESHOLD_MET -> LOCKED -> FULFILLING -> SETTLED", () => {
      let state = transitionClanState("FORMING", "THRESHOLD_MET");
      assert.equal(state, "THRESHOLD_MET");

      state = transitionClanState(state, "LOCKED");
      assert.equal(state, "LOCKED");

      state = transitionClanState(state, "FULFILLING");
      assert.equal(state, "FULFILLING");

      state = transitionClanState(state, "SETTLED");
      assert.equal(state, "SETTLED");
    });

    it("validates fallback from THRESHOLD_MET to FORMING if member pledge drops", () => {
      assert.equal(canTransitionClanState("THRESHOLD_MET", "FORMING"), true);
      const state = transitionClanState("THRESHOLD_MET", "FORMING");
      assert.equal(state, "FORMING");
    });

    it("validates terminal failure states EXPIRED and CANCELLED", () => {
      assert.equal(canTransitionClanState("FORMING", "EXPIRED"), true);
      assert.equal(canTransitionClanState("FORMING", "CANCELLED"), true);
      assert.equal(canTransitionClanState("THRESHOLD_MET", "CANCELLED"), true);
      assert.equal(canTransitionClanState("LOCKED", "CANCELLED"), true);
    });

    it("rejects invalid Clan state transitions", () => {
      assert.equal(canTransitionClanState("FORMING", "SETTLED"), false);
      assert.throws(
        () => validateClanStateTransition("FORMING", "SETTLED"),
        InvalidClanStateTransitionError
      );

      assert.equal(canTransitionClanState("LOCKED", "FORMING"), false);
      assert.throws(
        () => validateClanStateTransition("LOCKED", "FORMING"),
        InvalidClanStateTransitionError
      );

      assert.equal(canTransitionClanState("SETTLED", "CANCELLED"), false);
      assert.throws(
        () => validateClanStateTransition("SETTLED", "CANCELLED"),
        InvalidClanStateTransitionError
      );

      assert.equal(canTransitionClanState("CANCELLED", "FORMING"), false);
      assert.throws(
        () => validateClanStateTransition("CANCELLED", "FORMING"),
        InvalidClanStateTransitionError
      );
    });
  });

  describe("Member State Machine Transitions", () => {
    it("validates normal lifecycle: PLEDGED -> AUTHORIZED -> CAPTURED -> REFUNDED", () => {
      let state = transitionMemberState("PLEDGED", "AUTHORIZED");
      assert.equal(state, "AUTHORIZED");

      state = transitionMemberState(state, "CAPTURED");
      assert.equal(state, "CAPTURED");

      state = transitionMemberState(state, "REFUNDED");
      assert.equal(state, "REFUNDED");
    });

    it("validates cancellation path via VOIDED", () => {
      assert.equal(canTransitionMemberState("PLEDGED", "VOIDED"), true);
      assert.equal(canTransitionMemberState("AUTHORIZED", "VOIDED"), true);

      assert.equal(transitionMemberState("PLEDGED", "VOIDED"), "VOIDED");
      assert.equal(transitionMemberState("AUTHORIZED", "VOIDED"), "VOIDED");
    });

    it("rejects invalid Member state transitions", () => {
      assert.equal(canTransitionMemberState("PLEDGED", "CAPTURED"), false);
      assert.throws(
        () => validateMemberStateTransition("PLEDGED", "CAPTURED"),
        InvalidMemberStateTransitionError
      );

      assert.equal(canTransitionMemberState("CAPTURED", "AUTHORIZED"), false);
      assert.throws(
        () => validateMemberStateTransition("CAPTURED", "AUTHORIZED"),
        InvalidMemberStateTransitionError
      );

      assert.equal(canTransitionMemberState("VOIDED", "PLEDGED"), false);
      assert.throws(
        () => validateMemberStateTransition("VOIDED", "PLEDGED"),
        InvalidMemberStateTransitionError
      );

      assert.equal(canTransitionMemberState("REFUNDED", "PLEDGED"), false);
      assert.throws(
        () => validateMemberStateTransition("REFUNDED", "PLEDGED"),
        InvalidMemberStateTransitionError
      );
    });
  });
});
