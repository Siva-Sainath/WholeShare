export type GovernanceRuleType =
  | "INSPECTION_WINDOW_HOURS"
  | "SILENCE_AUTO_CONFIRM_HOURS"
  | "DAMAGE_EVIDENCE_REQUIREMENT"
  | "STEP_UP_THRESHOLD_USD"
  | "VOTING_WEIGHT_STRATEGY"
  | "DISPUTE_ESCALATION_WINDOW_HOURS"
  | "MIN_DISCOUNT_PERCENT";

export type DamageEvidenceStandard =
  | "PHOTO_ONLY"
  | "PHOTO_AND_VIDEO"
  | "THIRD_PARTY_INSPECTION";

export type VotingWeightStrategy =
  | "ONE_MEMBER_ONE_VOTE"
  | "VOLUME_WEIGHTED";

export interface ClanConstitutionRules {
  INSPECTION_WINDOW_HOURS: number;
  SILENCE_AUTO_CONFIRM_HOURS: number;
  DAMAGE_EVIDENCE_REQUIREMENT: DamageEvidenceStandard;
  STEP_UP_THRESHOLD_USD: number;
  VOTING_WEIGHT_STRATEGY: VotingWeightStrategy;
  DISPUTE_ESCALATION_WINDOW_HOURS: number;
  MIN_DISCOUNT_PERCENT: number;
}

export const DEFAULT_CLAN_RULES: ClanConstitutionRules = {
  INSPECTION_WINDOW_HOURS: 48,
  SILENCE_AUTO_CONFIRM_HOURS: 48,
  DAMAGE_EVIDENCE_REQUIREMENT: "PHOTO_ONLY",
  STEP_UP_THRESHOLD_USD: 1000,
  VOTING_WEIGHT_STRATEGY: "ONE_MEMBER_ONE_VOTE",
  DISPUTE_ESCALATION_WINDOW_HOURS: 48,
  MIN_DISCOUNT_PERCENT: 20,
};

export interface ClanConstitution {
  coalitionId: string;
  version: number;
  rules: ClanConstitutionRules;
  updatedAt: string;
}

export type ProposalStatus = "OPEN" | "ENACTED" | "REJECTED" | "EXPIRED";
export type VoteChoice = "AFFIRMATIVE" | "NEGATIVE";

export interface GovernanceProposal {
  id: string;
  coalitionId: string;
  proposerSmeId: string;
  ruleType: GovernanceRuleType;
  proposedValue: number | string;
  previousValue: number | string;
  rationale: string;
  status: ProposalStatus;
  createdAt: string;
  votingDeadline: string;
  quorumThreshold: number;
  majorityThreshold: number;
  weightStrategy: VotingWeightStrategy;
  enactedAt?: string;
}

export interface ClanVote {
  proposalId: string;
  coalitionId: string;
  smeId: string;
  choice: VoteChoice;
  weight: number;
  signature?: string;
  votedAt: string;
}

export interface VoteTally {
  proposalId: string;
  status: ProposalStatus;
  affirmativeCount: number;
  negativeCount: number;
  affirmativeWeight: number;
  negativeWeight: number;
  totalCastWeight: number;
  totalEligibleWeight: number;
  participationRate: number;
  approvalRate: number;
  quorumMet: boolean;
  majorityMet: boolean;
  reason: string;
}

export class GovernanceError extends Error {
  readonly code:
    | "IMMUTABLE_INVARIANT_VIOLATION"
    | "VALUE_OUT_OF_BOUNDS"
    | "UNAUTHORIZED_MEMBER"
    | "PROPOSAL_CLOSED"
    | "ALREADY_VOTED"
    | "PROPOSAL_NOT_FOUND"
    | "INVALID_SIGNATURE";

  constructor(
    code:
      | "IMMUTABLE_INVARIANT_VIOLATION"
      | "VALUE_OUT_OF_BOUNDS"
      | "UNAUTHORIZED_MEMBER"
      | "PROPOSAL_CLOSED"
      | "ALREADY_VOTED"
      | "PROPOSAL_NOT_FOUND"
      | "INVALID_SIGNATURE",
    message: string
  ) {
    super(`[ClanGovernance - ${code}]: ${message}`);
    this.name = "GovernanceError";
    this.code = code;
  }
}

export const IMMUTABLE_PLATFORM_INVARIANTS = [
  "SPEND_CAP_ENFORCEMENT",
  "INTEGER_CENTS_CONSERVATION",
  "SINGLE_REFUND_INVARIANT",
  "SOFT_AUTHORIZATION_HOLDS",
  "PLATFORM_MAX_KYC_CEILING"
];

export function validateProposalBounds(
  ruleType: GovernanceRuleType,
  proposedValue: number | string
): void {
  if (IMMUTABLE_PLATFORM_INVARIANTS.includes(ruleType as string)) {
    throw new GovernanceError(
      "IMMUTABLE_INVARIANT_VIOLATION",
      `Cannot propose changes to immutable FinTech invariant '${ruleType}'. Core money safety rules cannot be modified.`
    );
  }

  switch (ruleType) {
    case "INSPECTION_WINDOW_HOURS": {
      const val = Number(proposedValue);
      if (!Number.isInteger(val) || val < 12 || val > 168) {
        throw new GovernanceError(
          "VALUE_OUT_OF_BOUNDS",
          "Inspection window duration must be an integer between 12 and 168 hours."
        );
      }
      break;
    }

    case "SILENCE_AUTO_CONFIRM_HOURS": {
      const val = Number(proposedValue);
      if (!Number.isInteger(val) || val < 24 || val > 168) {
        throw new GovernanceError(
          "VALUE_OUT_OF_BOUNDS",
          "Silence auto-confirmation window must be an integer between 24 and 168 hours."
        );
      }
      break;
    }

    case "DAMAGE_EVIDENCE_REQUIREMENT": {
      const allowed: DamageEvidenceStandard[] = [
        "PHOTO_ONLY",
        "PHOTO_AND_VIDEO",
        "THIRD_PARTY_INSPECTION"
      ];
      if (!allowed.includes(proposedValue as DamageEvidenceStandard)) {
        throw new GovernanceError(
          "VALUE_OUT_OF_BOUNDS",
          `Damage evidence requirement must be one of: ${allowed.join(", ")}.`
        );
      }
      break;
    }

    case "STEP_UP_THRESHOLD_USD": {
      const val = Number(proposedValue);
      if (typeof val !== "number" || isNaN(val) || val < 500 || val > 5000) {
        throw new GovernanceError(
          "VALUE_OUT_OF_BOUNDS",
          "Step-up KYC authorization threshold must be between $500 and $5,000."
        );
      }
      break;
    }

    case "VOTING_WEIGHT_STRATEGY": {
      const allowed: VotingWeightStrategy[] = [
        "ONE_MEMBER_ONE_VOTE",
        "VOLUME_WEIGHTED"
      ];
      if (!allowed.includes(proposedValue as VotingWeightStrategy)) {
        throw new GovernanceError(
          "VALUE_OUT_OF_BOUNDS",
          `Voting weight strategy must be one of: ${allowed.join(", ")}.`
        );
      }
      break;
    }

    case "DISPUTE_ESCALATION_WINDOW_HOURS": {
      const val = Number(proposedValue);
      if (!Number.isInteger(val) || val < 24 || val > 120) {
        throw new GovernanceError(
          "VALUE_OUT_OF_BOUNDS",
          "Dispute escalation window must be an integer between 24 and 120 hours."
        );
      }
      break;
    }

    case "MIN_DISCOUNT_PERCENT": {
      const val = Number(proposedValue);
      if (typeof val !== "number" || isNaN(val) || val < 5 || val > 60) {
        throw new GovernanceError(
          "VALUE_OUT_OF_BOUNDS",
          "Minimum discount threshold must be between 5% and 60%."
        );
      }
      break;
    }

    default:
      throw new GovernanceError(
        "VALUE_OUT_OF_BOUNDS",
        `Unknown governance rule type: ${ruleType}`
      );
  }
}
