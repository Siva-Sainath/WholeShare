export type GovernanceRuleType =
  | "INSPECTION_WINDOW_HOURS"
  | "SILENCE_AUTO_CONFIRM_HOURS"
  | "DAMAGE_EVIDENCE_REQUIREMENT"
  | "STEP_UP_THRESHOLD_USD"
  | "VOTING_WEIGHT_STRATEGY"
  | "DISPUTE_ESCALATION_WINDOW_HOURS"
  | "MIN_DISCOUNT_PERCENT"
  | "META_GOVERNANCE_PROCEDURE";

export type DamageEvidenceStandard =
  | "PHOTO_ONLY"
  | "PHOTO_AND_VIDEO"
  | "THIRD_PARTY_INSPECTION";

export type VotingWeightStrategy =
  | "ONE_MEMBER_ONE_VOTE"
  | "VOLUME_WEIGHTED"
  | "CAPITAL_WEIGHTED"
  | "FOUNDER_VETO";

export type MetaGovernanceProcedure =
  | "DEMOCRATIC_SUPERMAJORITY"
  | "FOUNDER_ARBITRATION"
  | "EXPEDIENT_TRIAGE";

export interface ClanConstitutionRules {
  INSPECTION_WINDOW_HOURS: number;
  SILENCE_AUTO_CONFIRM_HOURS: number;
  DAMAGE_EVIDENCE_REQUIREMENT: DamageEvidenceStandard;
  STEP_UP_THRESHOLD_USD: number;
  VOTING_WEIGHT_STRATEGY: VotingWeightStrategy;
  DISPUTE_ESCALATION_WINDOW_HOURS: number;
  MIN_DISCOUNT_PERCENT: number;
  META_GOVERNANCE_PROCEDURE: MetaGovernanceProcedure;
}

export const DEFAULT_CLAN_RULES: ClanConstitutionRules = {
  INSPECTION_WINDOW_HOURS: 48,
  SILENCE_AUTO_CONFIRM_HOURS: 48,
  DAMAGE_EVIDENCE_REQUIREMENT: "PHOTO_ONLY",
  STEP_UP_THRESHOLD_USD: 1000,
  VOTING_WEIGHT_STRATEGY: "ONE_MEMBER_ONE_VOTE",
  DISPUTE_ESCALATION_WINDOW_HOURS: 48,
  MIN_DISCOUNT_PERCENT: 20,
  META_GOVERNANCE_PROCEDURE: "DEMOCRATIC_SUPERMAJORITY",
};

export interface MetaGovernancePolicy {
  defaultQuorum: number;
  supermajorityThreshold: number;
  procedureForUnforeseenIssues: MetaGovernanceProcedure;
  unforeseenVotingDurationHours: number;
}

export interface ClanConstitution {
  coalitionId: string;
  version: number;
  rules: ClanConstitutionRules;
  founderSmeId?: string;
  founderVetoRules?: GovernanceRuleType[];
  metaGovernancePolicy?: MetaGovernancePolicy;
  updatedAt: string;
}

export interface CustomClanCharter {
  clanId: string;
  clanName: string;
  founderSmeId: string;
  sku: string;
  skuName: string;
  targetUnits: number;
  basePriceCents: number;
  tiers: Array<{ tier: number; minUnits: number; priceCents: number; discountPct: number }>;
  constitution: ClanConstitutionRules;
  founderVetoRules: GovernanceRuleType[];
  metaGovernancePolicy: MetaGovernancePolicy;
  dataSources?: Array<{ type: "URL" | "INVOICE" | "SPREADSHEET"; location: string; verified: boolean }>;
  createdAt: string;
}

export interface MemberDebtLiability {
  debtId: string;
  smeId: string;
  clanId: string;
  amountCents: number;
  reason: "LATE_DISPUTE_CLAWBACK" | "UNPAID_SETTLEMENT_DEFICIT" | "BROKEN_PLEDGE_FEES";
  paypalInvoiceId?: string;
  paypalInvoiceQrUrl?: string;
  status: "OUTSTANDING" | "PARTIALLY_PAID" | "SETTLED";
  createdAt: string;
  updatedAt: string;
}

export interface ClanExitEvaluation {
  smeId: string;
  clanId: string;
  canExitImmediately: boolean;
  exitStatus: "EXITED_CLEAN" | "EXIT_QUEUED_POST_SETTLEMENT";
  lockedEscrowCents: number;
  unsettledDebtCents: number;
  message: string;
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
  requiresFounderVetoApproval?: boolean;
  founderApproved?: boolean;
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
  founderVetoSatisfied: boolean;
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
    | "FOUNDER_VETO_REJECTED"
    | "OUTSTANDING_DEBT_BLOCK"
    | "INVALID_SIGNATURE";

  constructor(
    code:
      | "IMMUTABLE_INVARIANT_VIOLATION"
      | "VALUE_OUT_OF_BOUNDS"
      | "UNAUTHORIZED_MEMBER"
      | "PROPOSAL_CLOSED"
      | "ALREADY_VOTED"
      | "PROPOSAL_NOT_FOUND"
      | "FOUNDER_VETO_REJECTED"
      | "OUTSTANDING_DEBT_BLOCK"
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
        "VOLUME_WEIGHTED",
        "CAPITAL_WEIGHTED",
        "FOUNDER_VETO"
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

    case "META_GOVERNANCE_PROCEDURE": {
      const allowed: MetaGovernanceProcedure[] = [
        "DEMOCRATIC_SUPERMAJORITY",
        "FOUNDER_ARBITRATION",
        "EXPEDIENT_TRIAGE"
      ];
      if (!allowed.includes(proposedValue as MetaGovernanceProcedure)) {
        throw new GovernanceError(
          "VALUE_OUT_OF_BOUNDS",
          `Meta-governance procedure must be one of: ${allowed.join(", ")}.`
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
