import test, { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  ClanGovernanceAdapter,
  getClanGovernanceAdapter,
} from "../src/adapter/clan-governance.adapter.ts";
import {
  ClanGovernanceStorage,
  getClanGovernanceStorage,
} from "../src/storage/clan-governance.storage.ts";
import {
  GovernanceError,
  DEFAULT_CLAN_RULES,
} from "../src/domain/clan-governance.ts";
import { DeliveryAdapter } from "../src/adapter/delivery.adapter.ts";
import { ClaimsAdapter } from "../src/adapter/claims.adapter.ts";
import { executeTool } from "../src/lib/tool-registry.js";
import { actionDispatcher } from "../src/lib/web-actions.js";

describe("Clan Democratic Governance & Cooperative Voting System", () => {
  let storage: ClanGovernanceStorage;
  let adapter: ClanGovernanceAdapter;

  const testCoalitionId = "coalition_bakery_clan_01";
  const members = [
    { smeId: "sme_austin_01", name: "Austin Bakery", pledgedUnits: 200 },
    { smeId: "sme_bean_02", name: "Bean & Leaf", pledgedUnits: 150 },
    { smeId: "sme_green_03", name: "GreenLeaf Cafe", pledgedUnits: 150 },
  ];

  beforeEach(() => {
    storage = new ClanGovernanceStorage();
    adapter = new ClanGovernanceAdapter(storage);
  });

  describe("1. Constitution Defaults & Boundary Safeguards", () => {
    it("initializes new clan with standard default rules", () => {
      const constitution = adapter.getConstitution(testCoalitionId);
      assert.equal(constitution.coalitionId, testCoalitionId);
      assert.equal(constitution.version, 1);
      assert.equal(
        constitution.rules.INSPECTION_WINDOW_HOURS,
        DEFAULT_CLAN_RULES.INSPECTION_WINDOW_HOURS
      );
      assert.equal(
        constitution.rules.SILENCE_AUTO_CONFIRM_HOURS,
        DEFAULT_CLAN_RULES.SILENCE_AUTO_CONFIRM_HOURS
      );
      assert.equal(
        constitution.rules.DAMAGE_EVIDENCE_REQUIREMENT,
        "PHOTO_ONLY"
      );
      assert.equal(constitution.rules.STEP_UP_THRESHOLD_USD, 1000);
      assert.equal(
        constitution.rules.VOTING_WEIGHT_STRATEGY,
        "ONE_MEMBER_ONE_VOTE"
      );
    });

    it("strictly blocks proposals attempting to modify immutable FinTech invariants", () => {
      assert.throws(
        () => {
          adapter.proposeRuleChange({
            coalitionId: testCoalitionId,
            proposerSmeId: "sme_austin_01",
            ruleType: "SPEND_CAP_ENFORCEMENT" as any,
            proposedValue: false as any,
            rationale: "Attempt to remove spend caps",
            members,
          });
        },
        (err: any) => {
          assert.equal(err instanceof GovernanceError, true);
          assert.equal(err.code, "IMMUTABLE_INVARIANT_VIOLATION");
          return true;
        }
      );
    });

    it("rejects proposal values outside platform safety bounds", () => {
      // Inspection window too short (< 12 hours)
      assert.throws(
        () => {
          adapter.proposeRuleChange({
            coalitionId: testCoalitionId,
            proposerSmeId: "sme_austin_01",
            ruleType: "INSPECTION_WINDOW_HOURS",
            proposedValue: 6,
            rationale: "Too fast inspection",
            members,
          });
        },
        (err: any) => {
          assert.equal(err instanceof GovernanceError, true);
          assert.equal(err.code, "VALUE_OUT_OF_BOUNDS");
          return true;
        }
      );

      // Step-up threshold exceeding platform ceiling ($5,000)
      assert.throws(
        () => {
          adapter.proposeRuleChange({
            coalitionId: testCoalitionId,
            proposerSmeId: "sme_austin_01",
            ruleType: "STEP_UP_THRESHOLD_USD",
            proposedValue: 10000,
            rationale: "Bypass KYC limits",
            members,
          });
        },
        (err: any) => {
          assert.equal(err instanceof GovernanceError, true);
          assert.equal(err.code, "VALUE_OUT_OF_BOUNDS");
          return true;
        }
      );
    });

    it("blocks non-members from proposing governance changes", () => {
      assert.throws(
        () => {
          adapter.proposeRuleChange({
            coalitionId: testCoalitionId,
            proposerSmeId: "sme_stranger_99",
            ruleType: "INSPECTION_WINDOW_HOURS",
            proposedValue: 72,
            rationale: "External proposal",
            members,
          });
        },
        (err: any) => {
          assert.equal(err instanceof GovernanceError, true);
          assert.equal(err.code, "UNAUTHORIZED_MEMBER");
          return true;
        }
      );
    });
  });

  describe("2. Voting Dynamics & Single-Vote Invariant", () => {
    it("allows registered members to cast affirmative or negative votes", () => {
      const proposal = adapter.proposeRuleChange({
        coalitionId: testCoalitionId,
        proposerSmeId: "sme_austin_01",
        ruleType: "INSPECTION_WINDOW_HOURS",
        proposedValue: 72,
        rationale: "Organic flour shipments need moisture inspection.",
        members,
      });

      const vote = adapter.castVote({
        proposalId: proposal.id,
        coalitionId: testCoalitionId,
        smeId: "sme_austin_01",
        choice: "AFFIRMATIVE",
        signature: "acp_sig_austin_01",
        members,
      });

      assert.equal(vote.choice, "AFFIRMATIVE");
      assert.equal(vote.weight, 1);
      assert.equal(vote.smeId, "sme_austin_01");
    });

    it("strictly enforces Single-Vote Invariant by blocking duplicate votes", () => {
      const proposal = adapter.proposeRuleChange({
        coalitionId: testCoalitionId,
        proposerSmeId: "sme_austin_01",
        ruleType: "INSPECTION_WINDOW_HOURS",
        proposedValue: 72,
        rationale: "Longer inspection.",
        members,
      });

      adapter.castVote({
        proposalId: proposal.id,
        coalitionId: testCoalitionId,
        smeId: "sme_bean_02",
        choice: "AFFIRMATIVE",
        members,
      });

      assert.throws(
        () => {
          adapter.castVote({
            proposalId: proposal.id,
            coalitionId: testCoalitionId,
            smeId: "sme_bean_02",
            choice: "NEGATIVE",
            members,
          });
        },
        (err: any) => {
          assert.equal(err instanceof GovernanceError, true);
          assert.equal(err.code, "ALREADY_VOTED");
          return true;
        }
      );
    });

    it("blocks voting after voting deadline has elapsed", () => {
      const proposal = adapter.proposeRuleChange({
        coalitionId: testCoalitionId,
        proposerSmeId: "sme_austin_01",
        ruleType: "INSPECTION_WINDOW_HOURS",
        proposedValue: 72,
        rationale: "Testing deadline.",
        votingDurationHours: 24,
        members,
      });

      const futureDate = new Date(Date.now() + 48 * 3600 * 1000);

      assert.throws(
        () => {
          adapter.castVote({
            proposalId: proposal.id,
            coalitionId: testCoalitionId,
            smeId: "sme_green_03",
            choice: "AFFIRMATIVE",
            members,
            now: futureDate,
          });
        },
        (err: any) => {
          assert.equal(err instanceof GovernanceError, true);
          assert.equal(err.code, "PROPOSAL_CLOSED");
          return true;
        }
      );
    });
  });

  describe("3. Quorum, Supermajority & Rule Enactment", () => {
    it("fails enactment when quorum (>50%) is not met", () => {
      const proposal = adapter.proposeRuleChange({
        coalitionId: testCoalitionId,
        proposerSmeId: "sme_austin_01",
        ruleType: "INSPECTION_WINDOW_HOURS",
        proposedValue: 72,
        rationale: "Need quorum.",
        members,
      });

      // Only 1 out of 3 members votes (33% participation < 50% quorum)
      adapter.castVote({
        proposalId: proposal.id,
        coalitionId: testCoalitionId,
        smeId: "sme_austin_01",
        choice: "AFFIRMATIVE",
        members,
      });

      const result = adapter.tallyAndEnact({
        proposalId: proposal.id,
        members,
        forceEarly: true,
      });

      assert.equal(result.proposal.status, "REJECTED");
      assert.equal(result.tally.quorumMet, false);
      assert.equal(result.enactedConstitution, undefined);
    });

    it("fails enactment when supermajority (>=66%) is not reached", () => {
      const proposal = adapter.proposeRuleChange({
        coalitionId: testCoalitionId,
        proposerSmeId: "sme_austin_01",
        ruleType: "INSPECTION_WINDOW_HOURS",
        proposedValue: 72,
        rationale: "Testing split vote.",
        members,
      });

      // 2 members vote: 1 YES, 1 NO (50% approval < 66% supermajority)
      adapter.castVote({
        proposalId: proposal.id,
        coalitionId: testCoalitionId,
        smeId: "sme_austin_01",
        choice: "AFFIRMATIVE",
        members,
      });
      adapter.castVote({
        proposalId: proposal.id,
        coalitionId: testCoalitionId,
        smeId: "sme_bean_02",
        choice: "NEGATIVE",
        members,
      });

      const result = adapter.tallyAndEnact({
        proposalId: proposal.id,
        members,
        forceEarly: true,
      });

      assert.equal(result.proposal.status, "REJECTED");
      assert.equal(result.tally.majorityMet, false);
    });

    it("enacts proposal and updates clan constitution when supermajority passes", () => {
      const proposal = adapter.proposeRuleChange({
        coalitionId: testCoalitionId,
        proposerSmeId: "sme_austin_01",
        ruleType: "INSPECTION_WINDOW_HOURS",
        proposedValue: 72,
        rationale: "3 days inspection needed.",
        members,
      });

      // 3 members vote: 3 YES, 0 NO (100% quorum, 100% supermajority)
      adapter.castVote({
        proposalId: proposal.id,
        coalitionId: testCoalitionId,
        smeId: "sme_austin_01",
        choice: "AFFIRMATIVE",
        members,
      });
      adapter.castVote({
        proposalId: proposal.id,
        coalitionId: testCoalitionId,
        smeId: "sme_bean_02",
        choice: "AFFIRMATIVE",
        members,
      });
      adapter.castVote({
        proposalId: proposal.id,
        coalitionId: testCoalitionId,
        smeId: "sme_green_03",
        choice: "AFFIRMATIVE",
        members,
      });

      const result = adapter.tallyAndEnact({
        proposalId: proposal.id,
        members,
        forceEarly: true,
      });

      assert.equal(result.proposal.status, "ENACTED");
      assert.equal(result.tally.quorumMet, true);
      assert.equal(result.tally.majorityMet, true);
      assert.ok(result.enactedConstitution);
      assert.equal(result.enactedConstitution.version, 2);
      assert.equal(
        result.enactedConstitution.rules.INSPECTION_WINDOW_HOURS,
        72
      );

      // Verify constitution stored persistently
      const current = adapter.getConstitution(testCoalitionId);
      assert.equal(current.rules.INSPECTION_WINDOW_HOURS, 72);
      assert.equal(current.version, 2);
    });

    it("evaluates volume-weighted voting when enabled", () => {
      // First enact VOLUME_WEIGHTED strategy on test storage
      const initialConst = storage.getConstitution(testCoalitionId);
      initialConst.rules.VOTING_WEIGHT_STRATEGY = "VOLUME_WEIGHTED";
      storage.saveConstitution(initialConst);

      const proposal = adapter.proposeRuleChange({
        coalitionId: testCoalitionId,
        proposerSmeId: "sme_austin_01",
        ruleType: "DAMAGE_EVIDENCE_REQUIREMENT",
        proposedValue: "PHOTO_AND_VIDEO",
        rationale: "Require video for large orders.",
        members,
      });

      // Austin (200 units) votes YES
      // Bean (150 units) votes NO
      // Green (150 units) votes YES
      // Total cast: 500 units. Total YES: 350 units (70% > 66% supermajority).
      adapter.castVote({
        proposalId: proposal.id,
        coalitionId: testCoalitionId,
        smeId: "sme_austin_01",
        choice: "AFFIRMATIVE",
        members,
      });
      adapter.castVote({
        proposalId: proposal.id,
        coalitionId: testCoalitionId,
        smeId: "sme_bean_02",
        choice: "NEGATIVE",
        members,
      });
      adapter.castVote({
        proposalId: proposal.id,
        coalitionId: testCoalitionId,
        smeId: "sme_green_03",
        choice: "AFFIRMATIVE",
        members,
      });

      const result = adapter.tallyAndEnact({
        proposalId: proposal.id,
        members,
        forceEarly: true,
      });

      assert.equal(result.proposal.status, "ENACTED");
      assert.equal(result.tally.affirmativeWeight, 350);
      assert.equal(result.tally.negativeWeight, 150);
      assert.equal(
        result.enactedConstitution?.rules.DAMAGE_EVIDENCE_REQUIREMENT,
        "PHOTO_AND_VIDEO"
      );
    });
  });

  describe("4. Downstream Adapter Propagation", () => {
    it("delivery adapter automatically adopts voted inspection window", () => {
      const testClanId = `coalition_custom_72_${Date.now()}`;
      // Enact 72 hours on global storage
      const constStorage = getClanGovernanceStorage();
      const constRecord = constStorage.getConstitution(testClanId);
      constRecord.rules.INSPECTION_WINDOW_HOURS = 72;
      constStorage.saveConstitution(constRecord);

      const deliveryAdapter = new DeliveryAdapter();
      const baseTime = new Date("2026-11-04T12:00:00.000Z");

      // Supplier confirms delivery
      deliveryAdapter.confirmDelivery({
        coalitionId: testClanId,
        smeId: "sme_austin_01",
        role: "supplier",
        deliveredAt: baseTime,
      });

      // Buyer confirms delivery 1 hour later
      const buyerTime = new Date("2026-11-04T13:00:00.000Z");
      const record = deliveryAdapter.confirmDelivery({
        coalitionId: testClanId,
        smeId: "sme_austin_01",
        role: "buyer",
        deliveredAt: buyerTime,
      });

      // Expected: buyerTime + 72 hours = 2026-11-07T13:00:00.000Z
      const expectedEnd = new Date(
        buyerTime.getTime() + 72 * 3600 * 1000
      ).toISOString();
      assert.equal(record.inspectionWindowEndsAt, expectedEnd);
    });

    it("claims adapter enforces clan-voted photo and video evidence standard", () => {
      // Enact PHOTO_AND_VIDEO standard
      const constStorage = getClanGovernanceStorage();
      const constRecord = constStorage.getConstitution("coalition_strict_evidence");
      constRecord.rules.DAMAGE_EVIDENCE_REQUIREMENT = "PHOTO_AND_VIDEO";
      constStorage.saveConstitution(constRecord);

      const claimsAdapter = new ClaimsAdapter();

      // Claim with photo only is rejected
      assert.throws(
        () => {
          claimsAdapter.intakeClaim({
            coalitionId: "coalition_strict_evidence",
            smeId: "sme_austin_01",
            orderId: "ORD_TEST_01",
            captureId: "CAP_TEST_01",
            damagedUnits: 5,
            unitPriceCents: 1000,
            orderValueCents: 5000,
            evidence: {
              photoUrls: ["https://storage.wholeshare.io/photo_torn_bag.jpg"],
              description: "Torn bag detected on pallet.",
            },
          });
        },
        (err: any) => {
          assert.match(err.message, /requires photo and video evidence/i);
          return true;
        }
      );

      // Claim with video is accepted
      const validClaim = claimsAdapter.intakeClaim({
        coalitionId: "coalition_strict_evidence",
        smeId: "sme_austin_01",
        orderId: "ORD_TEST_01",
        captureId: "CAP_TEST_01",
        damagedUnits: 5,
        unitPriceCents: 1000,
        orderValueCents: 5000,
        evidence: {
          photoUrls: [
            "https://storage.wholeshare.io/photo_torn_bag.jpg",
            "https://storage.wholeshare.io/unboxing_video.mp4",
          ],
          description: "Torn bag recorded in unboxing video.",
        },
      });

      assert.equal(validClaim.status, "DRAFT");
      assert.equal(validClaim.claimedAmount, 50);
    });
  });

  describe("5. Tool Registry Integration & Agent Operation", () => {
    it("drives full proposal, vote, and enactment lifecycle through executeTool", async () => {
      // Seed demonstration coalition in actionDispatcher
      actionDispatcher.resetState();

      // 1. Propose rule change via tool
      const proposeRes = await executeTool("create_governance_proposal", {
        coalitionId: "coalition_flour_01",
        proposerSmeId: "sme_austin_01",
        ruleType: "INSPECTION_WINDOW_HOURS",
        proposedValue: 72,
        rationale: "Allow 72 hours for flour quality laboratory testing.",
      });

      assert.equal(proposeRes.status, "SUCCESS");
      assert.ok(proposeRes.proposal);
      const proposalId = proposeRes.proposal.id;

      // 2. Member 1 votes affirmative
      const vote1Res = await executeTool("cast_clan_vote", {
        proposalId,
        coalitionId: "coalition_flour_01",
        smeId: "sme_austin_01",
        choice: "AFFIRMATIVE",
      });
      assert.equal(vote1Res.status, "SUCCESS");
      assert.equal(vote1Res.vote.choice, "AFFIRMATIVE");

      // 3. Member 2 votes affirmative
      const vote2Res = await executeTool("cast_clan_vote", {
        proposalId,
        coalitionId: "coalition_flour_01",
        smeId: "sme_bean_02",
        choice: "AFFIRMATIVE",
      });
      assert.equal(vote2Res.status, "SUCCESS");

      // 4. Tally and enact
      const tallyRes = await executeTool("tally_and_enact_proposal", {
        proposalId,
        coalitionId: "coalition_flour_01",
        forceEarly: true,
      });

      assert.equal(tallyRes.status, "SUCCESS");
      assert.equal(tallyRes.proposal.status, "ENACTED");
      assert.equal(
        tallyRes.enactedConstitution.rules.INSPECTION_WINDOW_HOURS,
        72
      );

      // 5. Query constitution tool
      const constRes = await executeTool("get_clan_constitution", {
        coalitionId: "coalition_flour_01",
      });

      assert.equal(constRes.status, "SUCCESS");
      assert.equal(constRes.constitution.rules.INSPECTION_WINDOW_HOURS, 72);
      assert.equal(constRes.proposals.length >= 1, true);
    });
  });
});
