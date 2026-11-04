import {
  type GovernanceRuleType,
  type GovernanceProposal,
  type ClanVote,
  type VoteTally,
  type ClanConstitution,
  type CustomClanCharter,
  validateProposalBounds,
  GovernanceError
} from "../domain/clan-governance.ts";
import {
  ClanGovernanceStorage,
  getClanGovernanceStorage
} from "../storage/clan-governance.storage.ts";

export interface CoalitionMemberBrief {
  smeId: string;
  name?: string;
  pledgedUnits?: number;
  authorizedCents?: number;
}

export interface ProposeRuleChangeParams {
  coalitionId: string;
  proposerSmeId: string;
  ruleType: GovernanceRuleType;
  proposedValue: number | string;
  rationale: string;
  votingDurationHours?: number;
  quorumThreshold?: number;
  majorityThreshold?: number;
  members?: CoalitionMemberBrief[];
}

export interface CastVoteParams {
  proposalId: string;
  coalitionId: string;
  smeId: string;
  choice: "AFFIRMATIVE" | "NEGATIVE";
  signature?: string;
  members?: CoalitionMemberBrief[];
  now?: Date;
}

export interface TallyAndEnactParams {
  proposalId: string;
  members: CoalitionMemberBrief[];
  forceEarly?: boolean;
  now?: Date;
}

export class ClanGovernanceAdapter {
  private storage: ClanGovernanceStorage;

  constructor(customStorage?: ClanGovernanceStorage) {
    this.storage = customStorage || getClanGovernanceStorage();
  }

  public getConstitution(coalitionId: string): ClanConstitution {
    return this.storage.getConstitution(coalitionId);
  }

  public listProposals(coalitionId: string): GovernanceProposal[] {
    return this.storage.listProposals(coalitionId);
  }

  public createCustomCharter(charter: CustomClanCharter): ClanConstitution {
    if (charter.constitution) {
      for (const [ruleKey, ruleVal] of Object.entries(charter.constitution)) {
        validateProposalBounds(ruleKey as GovernanceRuleType, ruleVal);
      }
    }

    const constitution: ClanConstitution = {
      coalitionId: charter.clanId,
      version: 1,
      rules: { ...charter.constitution },
      founderSmeId: charter.founderSmeId,
      founderVetoRules: charter.founderVetoRules || [],
      metaGovernancePolicy: charter.metaGovernancePolicy,
      updatedAt: new Date().toISOString()
    };
    return this.storage.saveConstitution(constitution);
  }

  public proposeRuleChange(params: ProposeRuleChangeParams): GovernanceProposal {
    const {
      coalitionId,
      proposerSmeId,
      ruleType,
      proposedValue,
      rationale,
      votingDurationHours = 24,
      quorumThreshold = 0.5,
      majorityThreshold = 0.66,
      members = []
    } = params;

    if (members.length > 0) {
      const isMember = members.some((m) => m.smeId === proposerSmeId);
      if (!isMember) {
        throw new GovernanceError(
          "UNAUTHORIZED_MEMBER",
          `SME ${proposerSmeId} is not a registered member of coalition ${coalitionId}. Only members can propose governance rules.`
        );
      }
    }

    validateProposalBounds(ruleType, proposedValue);

    const currentConstitution = this.storage.getConstitution(coalitionId);
    const previousValue = currentConstitution.rules[ruleType] ?? "NONE";

    const now = new Date();
    const votingDeadline = new Date(
      now.getTime() + votingDurationHours * 3600 * 1000
    ).toISOString();

    const isVetoProtected =
      currentConstitution.rules.VOTING_WEIGHT_STRATEGY === "FOUNDER_VETO" ||
      Boolean(currentConstitution.founderVetoRules?.includes(ruleType));

    const proposal: GovernanceProposal = {
      id: `prop_${coalitionId}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      coalitionId,
      proposerSmeId,
      ruleType,
      proposedValue,
      previousValue,
      rationale: rationale || `Propose change of ${ruleType} to ${proposedValue}`,
      status: "OPEN",
      createdAt: now.toISOString(),
      votingDeadline,
      quorumThreshold,
      majorityThreshold,
      weightStrategy: currentConstitution.rules.VOTING_WEIGHT_STRATEGY,
      requiresFounderVetoApproval: isVetoProtected,
      founderApproved: false
    };

    return this.storage.saveProposal(proposal);
  }

  public castVote(params: CastVoteParams): ClanVote {
    const { proposalId, coalitionId, smeId, choice, signature, members = [], now = new Date() } = params;

    const proposal = this.storage.getProposal(proposalId);
    if (!proposal) {
      throw new GovernanceError(
        "PROPOSAL_NOT_FOUND",
        `Governance proposal '${proposalId}' does not exist.`
      );
    }

    if (proposal.status !== "OPEN") {
      throw new GovernanceError(
        "PROPOSAL_CLOSED",
        `Cannot cast vote. Proposal '${proposalId}' is already ${proposal.status}.`
      );
    }

    const deadlineMs = new Date(proposal.votingDeadline).getTime();
    if (now.getTime() > deadlineMs) {
      throw new GovernanceError(
        "PROPOSAL_CLOSED",
        `Voting deadline for proposal '${proposalId}' elapsed at ${proposal.votingDeadline}.`
      );
    }

    let memberBrief: CoalitionMemberBrief | undefined;
    if (members.length > 0) {
      memberBrief = members.find((m) => m.smeId === smeId);
      if (!memberBrief) {
        throw new GovernanceError(
          "UNAUTHORIZED_MEMBER",
          `SME ${smeId} is not a member of coalition ${coalitionId}. Only verified clan members can vote.`
        );
      }
    }

    if (this.storage.hasMemberVoted(proposalId, smeId)) {
      throw new GovernanceError(
        "ALREADY_VOTED",
        `Member ${smeId} has already cast a vote on proposal '${proposalId}'. Single-vote invariant enforced.`
      );
    }

    let weight = 1;
    if (proposal.weightStrategy === "VOLUME_WEIGHTED") {
      weight = memberBrief?.pledgedUnits || 1;
    } else if (proposal.weightStrategy === "CAPITAL_WEIGHTED") {
      weight = Math.max(Math.round((memberBrief?.authorizedCents || 10000) / 100), 1);
    }

    const vote: ClanVote = {
      proposalId,
      coalitionId,
      smeId,
      choice,
      weight,
      signature: signature || `sig_${smeId}_${Date.now()}`,
      votedAt: now.toISOString()
    };

    this.storage.saveVote(vote);

    const constitution = this.storage.getConstitution(coalitionId);
    if (constitution.founderSmeId === smeId) {
      proposal.founderApproved = choice === "AFFIRMATIVE";
      this.storage.saveProposal(proposal);
    }

    return vote;
  }

  public tallyVotes(proposalId: string, members: CoalitionMemberBrief[]): VoteTally {
    const proposal = this.storage.getProposal(proposalId);
    if (!proposal) {
      throw new GovernanceError(
        "PROPOSAL_NOT_FOUND",
        `Governance proposal '${proposalId}' does not exist.`
      );
    }

    const votes = this.storage.getVotes(proposalId);

    let affirmativeCount = 0;
    let negativeCount = 0;
    let affirmativeWeight = 0;
    let negativeWeight = 0;

    for (const v of votes) {
      if (v.choice === "AFFIRMATIVE") {
        affirmativeCount++;
        affirmativeWeight += v.weight;
      } else {
        negativeCount++;
        negativeWeight += v.weight;
      }
    }

    const totalCastWeight = affirmativeWeight + negativeWeight;

    let totalEligibleWeight = 0;
    if (proposal.weightStrategy === "VOLUME_WEIGHTED") {
      totalEligibleWeight = members.reduce(
        (sum, m) => sum + (m.pledgedUnits || 1),
        0
      );
    } else if (proposal.weightStrategy === "CAPITAL_WEIGHTED") {
      totalEligibleWeight = members.reduce(
        (sum, m) => sum + Math.max(Math.round((m.authorizedCents || 10000) / 100), 1),
        0
      );
    } else {
      totalEligibleWeight = members.length > 0 ? members.length : Math.max(votes.length, 1);
    }

    const participationRate =
      totalEligibleWeight > 0 ? totalCastWeight / totalEligibleWeight : 0;
    const approvalRate =
      totalCastWeight > 0 ? affirmativeWeight / totalCastWeight : 0;

    const quorumMet = participationRate >= proposal.quorumThreshold;
    const majorityMet = approvalRate >= proposal.majorityThreshold;
    const founderVetoSatisfied =
      !proposal.requiresFounderVetoApproval || Boolean(proposal.founderApproved);

    let reason = "Voting in progress";
    if (!quorumMet) {
      reason = `Quorum not met: ${(participationRate * 100).toFixed(1)}% participation < ${(proposal.quorumThreshold * 100).toFixed(0)}% required`;
    } else if (!founderVetoSatisfied) {
      reason = "Proposal rejected by founder veto";
    } else if (!majorityMet) {
      reason = `Supermajority not met: ${(approvalRate * 100).toFixed(1)}% approval < ${(proposal.majorityThreshold * 100).toFixed(0)}% required`;
    } else {
      reason = `Proposal passed with ${(approvalRate * 100).toFixed(1)}% approval on ${(participationRate * 100).toFixed(1)}% turnout`;
    }

    return {
      proposalId,
      status: proposal.status,
      affirmativeCount,
      negativeCount,
      affirmativeWeight,
      negativeWeight,
      totalCastWeight,
      totalEligibleWeight,
      participationRate,
      approvalRate,
      quorumMet,
      majorityMet,
      founderVetoSatisfied,
      reason
    };
  }

  public tallyAndEnact(params: TallyAndEnactParams): {
    proposal: GovernanceProposal;
    tally: VoteTally;
    enactedConstitution?: ClanConstitution;
  } {
    const { proposalId, members, forceEarly = false, now = new Date() } = params;

    const proposal = this.storage.getProposal(proposalId);
    if (!proposal) {
      throw new GovernanceError(
        "PROPOSAL_NOT_FOUND",
        `Governance proposal '${proposalId}' does not exist.`
      );
    }

    const tally = this.tallyVotes(proposalId, members);
    const deadlineMs = new Date(proposal.votingDeadline).getTime();
    const isExpired = now.getTime() >= deadlineMs;

    if (!forceEarly && !isExpired && (!tally.quorumMet || !tally.majorityMet || !tally.founderVetoSatisfied)) {
      return { proposal, tally };
    }

    if (tally.quorumMet && tally.majorityMet && tally.founderVetoSatisfied) {
      proposal.status = "ENACTED";
      proposal.enactedAt = now.toISOString();
      this.storage.saveProposal(proposal);

      const constitution = this.storage.getConstitution(proposal.coalitionId);
      const updatedRules = { ...constitution.rules };
      let metaGovernancePolicy = constitution.metaGovernancePolicy;
      if (proposal.ruleType === "META_GOVERNANCE_PROCEDURE") {
        if (metaGovernancePolicy) {
          metaGovernancePolicy = {
            ...metaGovernancePolicy,
            procedureForUnforeseenIssues: proposal.proposedValue as any
          };
        }
      } else {
        (updatedRules as any)[proposal.ruleType] = proposal.proposedValue;
      }

      const enactedConstitution: ClanConstitution = {
        coalitionId: proposal.coalitionId,
        version: constitution.version + 1,
        rules: updatedRules,
        founderSmeId: constitution.founderSmeId,
        founderVetoRules: constitution.founderVetoRules,
        metaGovernancePolicy,
        updatedAt: now.toISOString()
      };

      this.storage.saveConstitution(enactedConstitution);

      return {
        proposal,
        tally: { ...tally, status: "ENACTED" },
        enactedConstitution
      };
    } else {
      proposal.status = "REJECTED";
      this.storage.saveProposal(proposal);

      return {
        proposal,
        tally: { ...tally, status: "REJECTED" }
      };
    }
  }
}

let globalClanGovernanceAdapter: ClanGovernanceAdapter | null = null;

export function getClanGovernanceAdapter(): ClanGovernanceAdapter {
  if (!globalClanGovernanceAdapter) {
    globalClanGovernanceAdapter = new ClanGovernanceAdapter();
  }
  return globalClanGovernanceAdapter;
}
