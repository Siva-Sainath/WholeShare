export type CoalitionStatus =
  | "FORMING"
  | "THRESHOLD_MET"
  | "AWAITING_STEP_UP"
  | "LOCKED"
  | "FULFILLING"
  | "SETTLED";

export type MemberStatus =
  | "PLEDGED"
  | "AWAITING_STEP_UP"
  | "AUTHORIZED"
  | "CAPTURED"
  | "REFUNDED";

export interface BuyerMandate {
  buyerId: string;
  buyerName: string;
  buyerEmail: string;
  sku: string;
  requestedUnits: number;
  maxSpendCents: number;
  stepUpThresholdCents: number;
  minDiscountPct: number;
  callbackUrl?: string;
  nonce: string;
  createdAt: number;
  hmacSignature?: string;
}

export interface SharedPaymentToken {
  tokenId: string;
  buyerId: string;
  sku: string;
  maxAuthorizedCents: number;
  stepUpThresholdCents: number;
  expiresAt: number;
  nonce: string;
  hmacSignature: string;
}

export interface BuyerAllocation {
  buyerId: string;
  units: number;
  amountCents: number;
  stepUpRequired: boolean;
}

export interface ModelNegotiationProposal {
  coalitionId: string;
  sku: string;
  totalUnits: number;
  unitPriceCents: number;
  discountPct: number;
  allocations: BuyerAllocation[];
  intent: "AUTHORIZE";
  idempotencyKey: string;
  reasoning?: string;
}

export interface InterceptorEvaluationResult {
  valid: boolean;
  invariantsPassed: string[];
  violations: string[];
  evaluatedAt: string;
  normalizedProposal?: ModelNegotiationProposal;
}

export interface CoalitionRecord {
  id: string;
  sku: string;
  skuName: string;
  targetUnits: number;
  currentUnits: number;
  unitPriceCents: number;
  discountTierPct: number;
  status: CoalitionStatus;
  createdAt: string;
  updatedAt: string;
}

export interface CoalitionMemberRecord {
  id: string;
  coalitionId: string;
  buyerId: string;
  buyerName: string;
  buyerEmail: string;
  pledgedUnits: number;
  authorizedCents: number;
  status: MemberStatus;
  callbackUrl?: string;
  paypalOrderId?: string;
  stepUpRequired: boolean;
  qrCodeUrl?: string;
  createdAt: string;
}

export interface AuditEventRecord {
  id: string;
  coalitionId: string;
  eventType: string;
  payload: Record<string, unknown>;
  createdAt: string;
}

export type AgentSessionStatus =
  | "RUNNING"
  | "AWAITING_STEP_UP"
  | "COMPLETED"
  | "FAILED"
  | "SUSPENDED";

export interface AgentStepRecord {
  sessionId: string;
  stepIndex: number;
  thought?: string;
  toolName?: string;
  toolArgs?: Record<string, unknown>;
  toolResult?: unknown;
  interceptorStatus: "PASSED" | "REJECTED";
  violations?: string[] | null;
  durationMs: number;
  createdAt?: string;
}

export interface AgentSessionRecord {
  id: string;
  model: string;
  status: AgentSessionStatus;
  prompt: string;
  finalMessage?: string | null;
  totalDurationMs?: number;
  stepUpToken?: string;
  metadata?: Record<string, unknown>;
  createdAt?: string;
  updatedAt?: string;
  steps?: AgentStepRecord[];
}

