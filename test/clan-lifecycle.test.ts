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
  RepaymentStorage,
  getRepaymentStorage,
} from "../src/storage/repayment.storage.ts";
import {
  GovernanceError,
  DEFAULT_CLAN_RULES,
  type CustomClanCharter,
} from "../src/domain/clan-governance.ts";
import { executeTool } from "../src/lib/tool-registry.js";
import { actionDispatcher } from "../src/lib/web-actions.js";

describe("Clan Sovereign Governance Lifecycle & Debt Binding Liabilities", () => {
  let storage: ClanGovernanceStorage;
  let adapter: ClanGovernanceAdapter;
  let repaymentStorage: RepaymentStorage;

  const testClanId = "coalition_ethiopian_coffee_01";
  const founderSmeId = "sme_founder_roaster_01";

  const customCharter: CustomClanCharter = {
    clanId: testClanId,
    clanName: "Specialty Ethiopian Green Coffee Syndicate",
    founderSmeId,
    sku: "ethiopian_coffee_beans",
    skuName: "Ethiopian Yirgacheffe Grade 1 Green Coffee",
    targetUnits: 500,
    basePriceCents: 1200,
    tiers: [
      { tier: 1, minUnits: 100, priceCents: 1200, discountPct: 0 },
      { tier: 2, minUnits: 300, priceCents: 1050, discountPct: 12.5 },
      { tier: 3, minUnits: 500, priceCents: 900, discountPct: 25 },
    ],
    constitution: {
      INSPECTION_WINDOW_HOURS: 72,
      SILENCE_AUTO_CONFIRM_HOURS: 48,
      DAMAGE_EVIDENCE_REQUIREMENT: "PHOTO_AND_VIDEO",
      STEP_UP_THRESHOLD_USD: 1500,
      VOTING_WEIGHT_STRATEGY: "CAPITAL_WEIGHTED",
      DISPUTE_ESCALATION_WINDOW_HOURS: 48,
      MIN_DISCOUNT_PERCENT: 20,
      META_GOVERNANCE_PROCEDURE: "DEMOCRATIC_SUPERMAJORITY",
    },
    founderVetoRules: ["STEP_UP_THRESHOLD_USD", "MIN_DISCOUNT_PERCENT"],
    metaGovernancePolicy: {
      defaultQuorum: 0.5,
      supermajorityThreshold: 0.66,
      procedureForUnforeseenIssues: "DEMOCRATIC_SUPERMAJORITY",
      unforeseenVotingDurationHours: 24,
    },
    createdAt: new Date().toISOString(),
  };

  beforeEach(() => {
    storage = new ClanGovernanceStorage();
    adapter = new ClanGovernanceAdapter(storage);
    repaymentStorage = getRepaymentStorage();
    actionDispatcher.resetState();
  });

  describe("1. Dynamic Clan Creation with Custom Constitution", () => {
    it("successfully creates clan with custom constitution, rules, and meta-governance", () => {
      const constitution = adapter.createCustomCharter(customCharter);

      assert.equal(constitution.coalitionId, testClanId);
      assert.equal(constitution.founderSmeId, founderSmeId);
      assert.equal(constitution.rules.INSPECTION_WINDOW_HOURS, 72);
      assert.equal(constitution.rules.SILENCE_AUTO_CONFIRM_HOURS, 48);
      assert.equal(constitution.rules.DAMAGE_EVIDENCE_REQUIREMENT, "PHOTO_AND_VIDEO");
      assert.equal(constitution.rules.STEP_UP_THRESHOLD_USD, 1500);
      assert.equal(constitution.rules.VOTING_WEIGHT_STRATEGY, "CAPITAL_WEIGHTED");
      assert.deepEqual(constitution.founderVetoRules, [
        "STEP_UP_THRESHOLD_USD",
        "MIN_DISCOUNT_PERCENT",
      ]);
      assert.equal(
        constitution.metaGovernancePolicy?.procedureForUnforeseenIssues,
        "DEMOCRATIC_SUPERMAJORITY"
      );
    });

    it("rejects custom charter with values outside platform safety bounds", () => {
      assert.throws(
        () => {
          adapter.createCustomCharter({
            ...customCharter,
            clanId: "coalition_invalid_01",
            constitution: {
              ...customCharter.constitution,
              INSPECTION_WINDOW_HOURS: 8, // Below 12h floor
            },
          });
        },
        (err: any) => {
          assert.equal(err instanceof GovernanceError, true);
          assert.equal(err.code, "VALUE_OUT_OF_BOUNDS");
          return true;
        }
      );
    });

    it("creates custom clan via actionDispatcher and blocks founder with outstanding debt", () => {
      const debtId = `debt_founder_test_${Date.now()}`;
      repaymentStorage.createMemberDebt({
        debtId,
        smeId: "sme_delinquent_founder_99",
        coalitionId: "coalition_prior_broken",
        amountCents: 50000,
        reason: "LATE_DISPUTE_CLAWBACK",
        status: "OUTSTANDING",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      // Attempt clan creation with delinquent founder
      assert.throws(
        () => {
          actionDispatcher.createCustomClan({
            clanId: "coalition_delinquent_founder_clan",
            founderSmeId: "sme_delinquent_founder_99",
            name: "Defaulted Clan",
            commodity: "Vanilla Beans",
            moq: 100,
            pricingTiers: [{ minUnits: 100, unitPriceCents: 5000 }],
          });
        },
        (err: any) => {
          assert.match(err.message, /OUTSTANDING_DEBT_BLOCK/);
          return true;
        }
      );

      // Settle debt
      repaymentStorage.settleMemberDebt(debtId);

      // Now clan creation succeeds
      const created = actionDispatcher.createCustomClan({
        clanId: "coalition_delinquent_founder_clan",
        founderSmeId: "sme_delinquent_founder_99",
        name: "Recovered Clan",
        commodity: "Vanilla Beans",
        moq: 100,
        pricingTiers: [{ minUnits: 100, unitPriceCents: 5000 }],
      });
      assert.equal(created.coalition.id, "coalition_delinquent_founder_clan");
      assert.equal(created.coalition.founderSmeId, "sme_delinquent_founder_99");
    });
  });

  describe("2. Capital-Weighted Voting Dynamics", () => {
    it("weights voting power by authorized capital cents when CAPITAL_WEIGHTED is active", () => {
      adapter.createCustomCharter(customCharter);

      const members = [
        { smeId: "sme_whale_01", name: "Capital Roasters", authorizedCents: 1000000 }, // $10,000 (83.3%)
        { smeId: "sme_small_02", name: "Micro Cafe", authorizedCents: 100000 },        // $1,000  (8.33%)
        { smeId: "sme_small_03", name: "Corner Bakery", authorizedCents: 100000 },     // $1,000  (8.33%)
      ];

      const proposal = adapter.proposeRuleChange({
        coalitionId: testClanId,
        proposerSmeId: "sme_whale_01",
        ruleType: "INSPECTION_WINDOW_HOURS",
        proposedValue: 96,
        rationale: "Need 96 hours for cupping and moisture analytics",
        members,
      });

      // Member 1 (Whale) votes affirmative
      adapter.castVote({
        proposalId: proposal.id,
        coalitionId: testClanId,
        smeId: "sme_whale_01",
        choice: "AFFIRMATIVE",
        members,
      });

      // Member 2 & 3 vote negative
      adapter.castVote({
        proposalId: proposal.id,
        coalitionId: testClanId,
        smeId: "sme_small_02",
        choice: "NEGATIVE",
        members,
      });
      adapter.castVote({
        proposalId: proposal.id,
        coalitionId: testClanId,
        smeId: "sme_small_03",
        choice: "NEGATIVE",
        members,
      });

      // Under ONE_MEMBER_ONE_VOTE, this would fail (1 yes vs 2 no = 33%).
      // Under CAPITAL_WEIGHTED, Whale holds 1,000,000 / 1,200,000 = 83.3% > 66% supermajority!
      const tally = adapter.tallyAndEnact({
        proposalId: proposal.id,
        members,
        forceEarly: true,
      });

      assert.equal(tally.proposal.status, "ENACTED");
      assert.ok(tally.enactedConstitution);
      assert.equal(tally.enactedConstitution.rules.INSPECTION_WINDOW_HOURS, 96);
      assert.equal(tally.tally.approvalRate > 0.66, true);
    });
  });

  describe("3. Founder Veto Mechanics", () => {
    it("fails proposal on protected rule when founder votes negative, even if all other members vote affirmative", () => {
      adapter.createCustomCharter(customCharter);

      const members = [
        { smeId: founderSmeId, name: "Founder Roaster", pledgedUnits: 100 },
        { smeId: "sme_partner_02", name: "Partner Cafe A", pledgedUnits: 200 },
        { smeId: "sme_partner_03", name: "Partner Cafe B", pledgedUnits: 200 },
      ];

      // Propose modifying MIN_DISCOUNT_PERCENT (which is in founderVetoRules)
      const proposal = adapter.proposeRuleChange({
        coalitionId: testClanId,
        proposerSmeId: "sme_partner_02",
        ruleType: "MIN_DISCOUNT_PERCENT",
        proposedValue: 15,
        rationale: "Lower discount hurdle for smaller order runs",
        members,
      });

      // Both partners vote AFFIRMATIVE (representing 80% of units)
      adapter.castVote({
        proposalId: proposal.id,
        coalitionId: testClanId,
        smeId: "sme_partner_02",
        choice: "AFFIRMATIVE",
        members,
      });
      adapter.castVote({
        proposalId: proposal.id,
        coalitionId: testClanId,
        smeId: "sme_partner_03",
        choice: "AFFIRMATIVE",
        members,
      });

      // Founder casts NEGATIVE veto
      adapter.castVote({
        proposalId: proposal.id,
        coalitionId: testClanId,
        smeId: founderSmeId,
        choice: "NEGATIVE",
        members,
      });

      const tally = adapter.tallyAndEnact({
        proposalId: proposal.id,
        members,
        forceEarly: true,
      });

      // Proposal fails due to founder veto!
      assert.equal(tally.proposal.status, "REJECTED");
      assert.equal(tally.tally.founderVetoSatisfied, false);
      assert.match(tally.tally.reason, /founder veto/i);
    });

    it("enacts proposal on protected rule when founder votes affirmative alongside supermajority", () => {
      adapter.createCustomCharter(customCharter);

      const members = [
        { smeId: founderSmeId, name: "Founder Roaster", pledgedUnits: 100 },
        { smeId: "sme_partner_02", name: "Partner Cafe A", pledgedUnits: 200 },
        { smeId: "sme_partner_03", name: "Partner Cafe B", pledgedUnits: 200 },
      ];

      const proposal = adapter.proposeRuleChange({
        coalitionId: testClanId,
        proposerSmeId: founderSmeId,
        ruleType: "STEP_UP_THRESHOLD_USD",
        proposedValue: 2000,
        rationale: "Adjust step up threshold for larger orders",
        members,
      });

      adapter.castVote({
        proposalId: proposal.id,
        coalitionId: testClanId,
        smeId: founderSmeId,
        choice: "AFFIRMATIVE",
        members,
      });
      adapter.castVote({
        proposalId: proposal.id,
        coalitionId: testClanId,
        smeId: "sme_partner_02",
        choice: "AFFIRMATIVE",
        members,
      });

      const tally = adapter.tallyAndEnact({
        proposalId: proposal.id,
        members,
        forceEarly: true,
      });

      assert.equal(tally.proposal.status, "ENACTED");
      assert.ok(tally.enactedConstitution);
      assert.equal(tally.enactedConstitution.rules.STEP_UP_THRESHOLD_USD, 2000);
      assert.equal(tally.tally.founderVetoSatisfied, true);
    });
  });

  describe("4. Meta-Governance Unforeseen Procedures", () => {
    it("allows updating clan meta-governance procedure via valid proposal", () => {
      adapter.createCustomCharter(customCharter);

      const members = [
        { smeId: founderSmeId, name: "Founder Roaster", pledgedUnits: 250 },
        { smeId: "sme_partner_02", name: "Partner Cafe A", pledgedUnits: 250 },
      ];

      const proposal = adapter.proposeRuleChange({
        coalitionId: testClanId,
        proposerSmeId: founderSmeId,
        ruleType: "META_GOVERNANCE_PROCEDURE",
        proposedValue: "FOUNDER_ARBITRATION",
        rationale: "Expedite future unforeseen disputes through founder arbitration",
        members,
      });

      adapter.castVote({
        proposalId: proposal.id,
        coalitionId: testClanId,
        smeId: founderSmeId,
        choice: "AFFIRMATIVE",
        members,
      });
      adapter.castVote({
        proposalId: proposal.id,
        coalitionId: testClanId,
        smeId: "sme_partner_02",
        choice: "AFFIRMATIVE",
        members,
      });

      const tally = adapter.tallyAndEnact({
        proposalId: proposal.id,
        members,
        forceEarly: true,
      });

      assert.equal(tally.proposal.status, "ENACTED");
      assert.ok(tally.enactedConstitution);
      assert.equal(
        tally.enactedConstitution.metaGovernancePolicy?.procedureForUnforeseenIssues,
        "FOUNDER_ARBITRATION"
      );
    });

    it("strictly blocks attempt to modify immutable FinTech invariants via meta-governance", () => {
      adapter.createCustomCharter(customCharter);

      const members = [{ smeId: founderSmeId, name: "Founder Roaster", pledgedUnits: 500 }];

      assert.throws(
        () => {
          adapter.proposeRuleChange({
            coalitionId: testClanId,
            proposerSmeId: founderSmeId,
            ruleType: "SINGLE_REFUND_INVARIANT" as any,
            proposedValue: false as any,
            rationale: "Attempt to allow multiple refunds",
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
  });

  describe("5. Voluntary Clan Exit & Inescapable Liabilities", () => {
    it("allows clean exit during FORMING status and reallocates units", async () => {
      // Create fresh coalition in FORMING
      actionDispatcher.createCustomClan({
        clanId: "coalition_exit_forming_01",
        founderSmeId: "sme_founder_exit",
        name: "Exit Test Clan",
        commodity: "Artisan Flour",
        moq: 300,
        pricingTiers: [{ minUnits: 300, unitPriceCents: 2000 }],
      });

      // Add a member
      await actionDispatcher.joinCoalition({
        coalitionId: "coalition_exit_forming_01",
        smeId: "sme_leaving_member_01",
        units: 100,
      });

      // Verify exit evaluation
      const evalResult = actionDispatcher.evaluateMemberExit({
        coalitionId: "coalition_exit_forming_01",
        smeId: "sme_leaving_member_01",
      });
      assert.equal(evalResult.canExitImmediately, true);
      assert.equal(evalResult.lockedEscrowCents, 0);

      // Execute exit
      const exitResult = actionDispatcher.leaveCoalition({
        coalitionId: "coalition_exit_forming_01",
        smeId: "sme_leaving_member_01",
      });
      assert.equal(exitResult.status, "EXITED_CLEAN");
      assert.equal(exitResult.memberRemoved, true);

      // Verify coalition state updated
      const coalition = actionDispatcher.coalitions.get("coalition_exit_forming_01");
      assert.ok(coalition);
      assert.equal(
        coalition.members.some((m: any) => m.smeId === "sme_leaving_member_01"),
        false
      );
    });

    it("prevents immediate exit during LOCKED status and queues post-settlement exit to preserve co-purchaser batch", async () => {
      // Create coalition and advance to LOCKED
      actionDispatcher.createCustomClan({
        clanId: "coalition_exit_locked_01",
        founderSmeId: "sme_founder_locked",
        name: "Locked Batch Clan",
        commodity: "Raw Sugar",
        moq: 200,
        pricingTiers: [{ minUnits: 200, unitPriceCents: 1500 }],
      });

      await actionDispatcher.joinCoalition({
        coalitionId: "coalition_exit_locked_01",
        smeId: "sme_locked_member_01",
        units: 200,
      });

      // Lock escrow
      const coalition = actionDispatcher.coalitions.get("coalition_exit_locked_01")!;
      coalition.status = "LOCKED";
      coalition.members[0].authorizationId = "AUTH_LOCKED_999";
      coalition.members[0].authorizedCents = 300000;

      // Evaluate exit
      const evalResult = actionDispatcher.evaluateMemberExit({
        coalitionId: "coalition_exit_locked_01",
        smeId: "sme_locked_member_01",
      });
      assert.equal(evalResult.canExitImmediately, false);
      assert.match(evalResult.message, /Escrow soft hold must remain locked/i);
      assert.equal(evalResult.lockedEscrowCents, 300000);

      // Execute leave request
      const exitResult = actionDispatcher.leaveCoalition({
        coalitionId: "coalition_exit_locked_01",
        smeId: "sme_locked_member_01",
      });
      assert.equal(exitResult.status, "EXIT_QUEUED_POST_SETTLEMENT");
      assert.equal(exitResult.lockedEscrowCents, 300000);

      // Member's pre-authorization remains locked
      const member = coalition.members[0];
      assert.equal(member.status, "EXIT_QUEUED_POST_SETTLEMENT");
      assert.equal(member.authorizationId, "AUTH_LOCKED_999");
    });
  });

  describe("6. Debt Invoicing via PayPal SDK & Delinquency Gate", () => {
    it("blocks delinquent members with unpaid debts from joining clans until settled", async () => {
      const delinquentSmeId = `sme_bad_debtor_${Date.now()}`;
      const debtId = `debt_unpaid_${Date.now()}`;

      // Record outstanding debt
      repaymentStorage.createMemberDebt({
        debtId,
        smeId: delinquentSmeId,
        clanId: "coalition_broken_deal",
        amountCents: 75000,
        reason: "LATE_DISPUTE_CLAWBACK",
        status: "OUTSTANDING",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      // Create a test clan
      actionDispatcher.createCustomClan({
        clanId: "coalition_debt_gate_clan",
        founderSmeId: "sme_clean_founder",
        name: "Strict Clan",
        commodity: "Specialty Grain",
        moq: 100,
        pricingTiers: [{ minUnits: 100, unitPriceCents: 1000 }],
      });

      // Attempt to join with unpaid debt
      await assert.rejects(
        async () => {
          await actionDispatcher.joinCoalition({
            coalitionId: "coalition_debt_gate_clan",
            smeId: delinquentSmeId,
            units: 50,
          });
        },
        (err: any) => {
          assert.match(err.message, /OUTSTANDING_DEBT_BLOCK/);
          return true;
        }
      );

      // Settle the debt
      repaymentStorage.settleMemberDebt(debtId);

      // Now join succeeds
      const joinResult = await actionDispatcher.joinCoalition({
        coalitionId: "coalition_debt_gate_clan",
        smeId: delinquentSmeId,
        units: 50,
      });
      assert.equal(joinResult.id, "coalition_debt_gate_clan");
    });

    it("issues PayPal debt invoice and settles debt cleanly via tools", async () => {
      const debtorSmeId = `sme_invoice_test_${Date.now()}`;

      // Issue invoice via tool (it creates debt record and PayPal invoice)
      const invRes = await executeTool("issue_paypal_debt_invoice", {
        smeId: debtorSmeId,
        smeEmail: "debtor@example.com",
        clanId: "coalition_disputed_01",
        amountCents: 12000,
        reason: "BROKEN_PLEDGE_FEES",
        note: "Wholeshare batch liquidated liability",
      });

      assert.equal(invRes.status, "SUCCESS");
      assert.ok(invRes.debtRecord);
      assert.ok(invRes.debtRecord.paypalInvoiceId);
      const generatedDebtId = invRes.debtRecord.debtId;

      // Check liquidity tool
      const liqRes = await executeTool("check_buyer_liquidity_and_ar", {
        smeId: debtorSmeId,
      });
      assert.equal(liqRes.status, "SUCCESS");
      assert.equal(liqRes.outstandingDebtCents, 12000);

      // Settle debt via tool
      const settleRes = await executeTool("settle_member_debt", {
        debtId: generatedDebtId,
      });
      assert.equal(settleRes.status, "SUCCESS");
      assert.equal(settleRes.debt.status, "SETTLED");

      // Verify zero debt afterwards
      const liqAfter = await executeTool("check_buyer_liquidity_and_ar", {
        smeId: debtorSmeId,
      });
      assert.equal(liqAfter.outstandingDebtCents, 0);
    });
  });

  describe("7. Full Agent Tool Registry Integration", () => {
    it("drives custom clan creation, voluntary exit, and PayPal toolkit execution via executeTool", async () => {
      const clanToolRes = await executeTool("create_custom_clan_with_constitution", {
        clanId: `coalition_tool_${Date.now()}`,
        founderSmeId: "sme_tool_founder",
        name: "Tool Created Clan",
        commodity: "Packaging Cardboard",
        moq: 1000,
        pricingTiers: [{ minUnits: 1000, unitPriceCents: 150 }],
        constitution: {
          INSPECTION_WINDOW_HOURS: 48,
          SILENCE_AUTO_CONFIRM_HOURS: 24,
          DAMAGE_EVIDENCE_REQUIREMENT: "PHOTO_ONLY",
          STEP_UP_THRESHOLD_USD: 1000,
          VOTING_WEIGHT_STRATEGY: "ONE_MEMBER_ONE_VOTE",
        },
        metaGovernanceProcedure: "EXPEDIENT_TRIAGE",
      });

      assert.equal(clanToolRes.status, "SUCCESS");
      assert.ok(clanToolRes.coalition);
      assert.ok(clanToolRes.constitution);
      assert.equal(
        clanToolRes.constitution.metaGovernancePolicy?.procedureForUnforeseenIssues,
        "EXPEDIENT_TRIAGE"
      );

      // Join a member so we can test exit
      await actionDispatcher.joinCoalition({
        coalitionId: clanToolRes.coalition.id,
        smeId: "sme_member_tool_01",
        units: 50,
      });

      // Evaluate exit via tool
      const exitEvalRes = await executeTool("evaluate_clan_voluntary_exit", {
        coalitionId: clanToolRes.coalition.id,
        smeId: "sme_member_tool_01",
      });
      assert.equal(exitEvalRes.status, "SUCCESS");
      assert.equal(exitEvalRes.evaluation.canExitImmediately, true);

      // Leave clan via tool
      const leaveRes = await executeTool("leave_clan", {
        coalitionId: clanToolRes.coalition.id,
        smeId: "sme_member_tool_01",
      });
      assert.equal(leaveRes.status, "EXITED_CLEAN");
      assert.equal(leaveRes.memberRemoved, true);

      // Test direct PayPal Toolkit Router tool
      const toolkitRes = await executeTool("paypal_execute_toolkit_action", {
        action: "orders_get",
        params: { id: "ORD-NONEXISTENT-TEST" },
      });
      assert.ok(toolkitRes);
      assert.ok(toolkitRes.status === "ERROR" || toolkitRes.status === "SUCCESS");
    });
  });
});
