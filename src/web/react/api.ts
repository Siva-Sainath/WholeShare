export interface ClanRecord {
  id: string;
  name: string;
  sku: string;
  category: string;
  city?: string;
  countryCode?: string;
  currency: string;
  status: string;
  currentUnits: number;
  targetUnits: number;
  progressPct: number;
  unitPriceCents: number;
  discountTierPct: number;
  membersCount: number;
}

export interface ClanDetail extends ClanRecord {
  members?: LedgerMember[];
  supplierName?: string;
  supplierTrustScore?: number;
  estimatedDeliveryDays?: number;
  fulfilment?: { mode: string; points: Array<{ label: string; address: string; city: string }> };
}

export interface LedgerMember {
  smeId: string;
  name: string;
  pledgedUnits: number;
  authorizedUsd: string;
  authorizedCents: number;
  status: string;
  paypalOrderId: string | null;
}

export interface LedgerClan {
  coalitionId: string;
  sku: string;
  skuName: string;
  targetUnits: number;
  currentUnits: number;
  unitPriceUsd: string;
  totalEscrowUsd: string;
  unitPriceCents: number;
  totalEscrowCents: number;
  discountTierPct: number;
  status: string;
  membersCount: number;
  members: LedgerMember[];
}

export interface ClaimReceipt { claimId: string; status: string; }
export interface ClaimRecord {
  product?: string;
  city?: string;
  supplierName?: string;
  claimId: string;
  clanId: string;
  memberId: string;
  orderId: string;
  captureId: string;
  damagedUnits: number;
  unitPrice: number;
  orderValue: number;
  claimedAmount: number;
  status: string;
  createdAt: string;
  updatedAt?: string;
  evidence?: {
    photoUrls: string[];
    description: string;
  };
}
export interface PledgeQuote { clanId: string; units: number; unitPriceCents: number; amountCents: number; currency: string; discountPct: number; status: "QUOTED"; }
export interface PayPalPledgeOrder { orderId: string; amountCents: number; currency: string; intent: "AUTHORIZE"; status: string; }
export interface PayPalAuthorizationReceipt { orderId: string; authorizationId: string; status: "AUTHORIZED"; amountCents: number; currency: string; clanId: string; units: number; clanStatus: string; }

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function requireString(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  if (typeof value !== "string") throw new Error(`Invalid API response: ${key} must be text.`);
  return value;
}

function requireNumber(record: Record<string, unknown>, key: string): number {
  const value = record[key];
  if (typeof value !== "number" || !Number.isFinite(value)) throw new Error(`Invalid API response: ${key} must be numeric.`);
  return value;
}

async function getJson(path: string): Promise<unknown> {
  const response = await fetch(path, { headers: { accept: "application/json" } });
  const payload = await readJsonResponse(response);
  if (!response.ok) {
    const message = isRecord(payload) && typeof payload.error === "string" ? payload.error : `Request failed (${response.status}).`;
    throw new Error(message);
  }
  return payload;
}

async function readJsonResponse(response: Response): Promise<unknown> {
  const text = await response.text();
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new Error(response.ok ? "The server returned an unreadable response. Try again." : `The service returned an unreadable error (${response.status}). Try again.`);
  }
}

async function postJson(path: string, body?: unknown): Promise<unknown> {
  const response = await fetch(path, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const payload = await readJsonResponse(response);
  if (!response.ok) {
    const message = isRecord(payload) && typeof payload.error === "string" ? payload.error : `Request failed (${response.status}).`;
    throw new Error(message);
  }
  return payload;
}

export async function fetchPledgeQuote(input: { clanId: string; units: number }): Promise<PledgeQuote> {
  const payload = await postJson("/api/v1/paypal/pledge-quote", input);
  if (!isRecord(payload)) throw new Error("Invalid PayPal quote from the server.");
  return {
    clanId: requireString(payload, "clanId"),
    units: requireNumber(payload, "units"),
    unitPriceCents: requireNumber(payload, "unitPriceCents"),
    amountCents: requireNumber(payload, "amountCents"),
    currency: requireString(payload, "currency"),
    discountPct: requireNumber(payload, "discountPct"),
    status: "QUOTED"
  };
}

export async function createPayPalPledgeOrder(input: { clanId: string; units: number; businessName: string }): Promise<PayPalPledgeOrder> {
  const payload = await postJson("/api/v1/paypal/pledges", input);
  if (!isRecord(payload) || requireString(payload, "intent") !== "AUTHORIZE") throw new Error("PayPal did not return an authorization order.");
  return {
    orderId: requireString(payload, "orderId"),
    amountCents: requireNumber(payload, "amountCents"),
    currency: requireString(payload, "currency"),
    intent: "AUTHORIZE",
    status: requireString(payload, "status")
  };
}

export async function authorizePayPalPledge(orderId: string): Promise<PayPalAuthorizationReceipt> {
  const payload = await postJson(`/api/v1/paypal/pledges/${encodeURIComponent(orderId)}/authorize`);
  if (!isRecord(payload) || requireString(payload, "status") !== "AUTHORIZED") throw new Error("PayPal has not confirmed this authorization.");
  return {
    orderId: requireString(payload, "orderId"),
    authorizationId: requireString(payload, "authorizationId"),
    status: "AUTHORIZED",
    amountCents: requireNumber(payload, "amountCents"),
    currency: requireString(payload, "currency"),
    clanId: requireString(payload, "clanId"),
    units: requireNumber(payload, "units"),
    clanStatus: requireString(payload, "clanStatus")
  };
}

export async function getPayPalSdkConfig(): Promise<{ clientId: string; sdkUrl: string; mode: string }> {
  const payload = await getJson("/api/v1/paypal/sdk-config");
  if (!isRecord(payload)) throw new Error("Could not configure PayPal checkout.");
  return {
    clientId: requireString(payload, "clientId"),
    sdkUrl: requireString(payload, "sdkUrl"),
    mode: requireString(payload, "mode")
  };
}

function toClanRecord(entry: unknown): ClanRecord {
  if (!isRecord(entry)) throw new Error("Invalid clan record from the server.");
  return {
    id: requireString(entry, "id"),
    name: requireString(entry, "name"),
    sku: requireString(entry, "sku"),
    category: requireString(entry, "category"),
    city: typeof entry.city === "string" ? entry.city : undefined,
    countryCode: typeof entry.countryCode === "string" ? entry.countryCode : undefined,
    currency: typeof entry.currency === "string" ? entry.currency : "USD",
    status: requireString(entry, "status"),
    currentUnits: requireNumber(entry, "currentUnits"),
    targetUnits: requireNumber(entry, "targetUnits"),
    progressPct: requireNumber(entry, "progressPct"),
    unitPriceCents: requireNumber(entry, "unitPriceCents"),
    discountTierPct: requireNumber(entry, "discountTierPct"),
    membersCount: requireNumber(entry, "membersCount")
  };
}

export interface ClanPage {
  clans: ClanRecord[];
  total: number;
  raw: Array<Record<string, unknown>>;
}

export interface ClanFacets {
  categories: Array<{ name: string; count: number }>;
  cities: Array<{ name: string; count: number }>;
  total: number;
}

export async function fetchClansPage(params: { search?: string; category?: string; city?: string; limit?: number; offset?: number } = {}): Promise<ClanPage> {
  const query = new URLSearchParams({ limit: String(params.limit ?? 100), offset: String(params.offset ?? 0) });
  if (params.search?.trim()) query.set("search", params.search.trim());
  if (params.category) query.set("category", params.category);
  if (params.city) query.set("city", params.city);
  const payload = await getJson(`/api/v1/clans?${query.toString()}`);
  if (!isRecord(payload) || !Array.isArray(payload.clans)) throw new Error("Invalid clan response from the server.");
  const raw = (payload.clans as unknown[]).filter((entry): entry is Record<string, unknown> => isRecord(entry) && typeof entry.id === "string" && !entry.id.startsWith("clan-test-"));
  return { clans: raw.map(toClanRecord), total: typeof payload.count === "number" ? payload.count : raw.length, raw };
}

export async function fetchClanFacets(): Promise<ClanFacets> {
  const payload = await getJson("/api/v1/clans/facets");
  if (!isRecord(payload) || !Array.isArray(payload.categories) || !Array.isArray(payload.cities)) throw new Error("Invalid facet response from the server.");
  return payload as unknown as ClanFacets;
}

export async function fetchClans(): Promise<ClanRecord[]> {
  return (await fetchClansPage()).clans;
}

export async function fetchClanById(clanId: string): Promise<ClanDetail> {
  const payload = await getJson(`/api/v1/clans/${encodeURIComponent(clanId)}`);
  if (!isRecord(payload) || !isRecord(payload.clan)) throw new Error("Invalid clan response from the server.");
  const entry = payload.clan;
  return {
    id: requireString(entry, "id"),
    name: requireString(entry, "name"),
    sku: requireString(entry, "sku"),
    category: requireString(entry, "category"),
    city: typeof entry.city === "string" ? entry.city : undefined,
    countryCode: typeof entry.countryCode === "string" ? entry.countryCode : undefined,
    currency: typeof entry.currency === "string" ? entry.currency : "USD",
    status: requireString(entry, "status"),
    currentUnits: requireNumber(entry, "currentUnits"),
    targetUnits: requireNumber(entry, "targetUnits"),
    progressPct: requireNumber(entry, "progressPct"),
    unitPriceCents: requireNumber(entry, "unitPriceCents"),
    discountTierPct: requireNumber(entry, "discountTierPct"),
    membersCount: requireNumber(entry, "membersCount"),
    members: Array.isArray(entry.members) ? (entry.members as LedgerMember[]) : undefined,
    supplierName: typeof entry.supplierName === "string" ? entry.supplierName : undefined,
    supplierTrustScore: typeof entry.supplierTrustScore === "number" ? entry.supplierTrustScore : undefined,
    estimatedDeliveryDays: typeof entry.estimatedDeliveryDays === "number" ? entry.estimatedDeliveryDays : undefined,
    fulfilment: isRecord(entry.fulfilment) && Array.isArray(entry.fulfilment.points) ? (entry.fulfilment as unknown as ClanDetail["fulfilment"]) : undefined
  };
}

function parseUsdToCents(value: string): number {
  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed)) throw new Error("Invalid ledger amount from the server.");
  return Math.round(parsed * 100);
}

export async function fetchLedger(): Promise<LedgerClan[]> {
  const payload = await getJson("/api/v1/ledger");
  if (!Array.isArray(payload)) throw new Error("Invalid ledger response from the server.");
  return payload.map((entry): LedgerClan => {
    if (!isRecord(entry)) throw new Error("Invalid ledger row from the server.");
    const unitPriceUsd = requireString(entry, "unitPriceUsd");
    const totalEscrowUsd = requireString(entry, "totalEscrowUsd");
    const members = Array.isArray(entry.members) ? entry.members : [];
    return {
      coalitionId: requireString(entry, "coalitionId"),
      sku: requireString(entry, "sku"),
      skuName: requireString(entry, "skuName"),
      targetUnits: requireNumber(entry, "targetUnits"),
      currentUnits: requireNumber(entry, "currentUnits"),
      unitPriceUsd,
      totalEscrowUsd,
      unitPriceCents: typeof entry.unitPriceCents === "number" ? entry.unitPriceCents : parseUsdToCents(unitPriceUsd),
      totalEscrowCents: typeof entry.totalEscrowCents === "number" ? entry.totalEscrowCents : parseUsdToCents(totalEscrowUsd),
      discountTierPct: requireNumber(entry, "discountTierPct"),
      status: requireString(entry, "status"),
      membersCount: requireNumber(entry, "membersCount"),
      members: members.map((member): LedgerMember => {
        if (!isRecord(member)) throw new Error("Invalid ledger member from the server.");
        const authorizedUsd = requireString(member, "authorizedUsd");
        return {
          smeId: requireString(member, "smeId"),
          name: requireString(member, "name"),
          pledgedUnits: requireNumber(member, "pledgedUnits"),
          authorizedUsd,
          authorizedCents: typeof member.authorizedCents === "number" ? member.authorizedCents : parseUsdToCents(authorizedUsd),
          status: requireString(member, "status"),
          paypalOrderId: typeof member.paypalOrderId === "string" ? member.paypalOrderId : null
        };
      })
    };
  });
}

export interface ShipmentRecord {
  id: string;
  clanId: string;
  memberId?: string;
  trackingNumber: string;
  carrierName?: string;
  supplierDeliveredAt?: string;
  buyerDeliveredAt?: string;
  inspectionWindowEndsAt?: string;
  source?: string;
  conditionNotes?: string;
  createdAt?: string;
  status?: string;
  product?: string;
  groupName?: string;
  quantity?: number;
  shipDate?: string;
  expectedDeliveryAt?: string;
}

export async function fetchShipments(): Promise<{ count: number; shipments: ShipmentRecord[] }> {
  const payload = await getJson("/api/v1/logistics/shipments");
  if (!isRecord(payload) || !Array.isArray(payload.shipments)) throw new Error("Invalid shipment response from the server.");
  const count = typeof payload.count === "number" ? payload.count : payload.shipments.length;
  return {
    count,
    shipments: payload.shipments.map((entry): ShipmentRecord => {
      if (!isRecord(entry)) throw new Error("Invalid shipment record from the server.");
      return {
        id: requireString(entry, "id"),
        clanId: requireString(entry, "clanId"),
        memberId: typeof entry.memberId === "string" ? entry.memberId : undefined,
        trackingNumber: typeof entry.trackingNumber === "string" ? entry.trackingNumber : "",
        carrierName: typeof entry.carrierName === "string" ? entry.carrierName : undefined,
        supplierDeliveredAt: typeof entry.supplierDeliveredAt === "string" ? entry.supplierDeliveredAt : undefined,
        buyerDeliveredAt: typeof entry.buyerDeliveredAt === "string" ? entry.buyerDeliveredAt : undefined,
        inspectionWindowEndsAt: typeof entry.inspectionWindowEndsAt === "string" ? entry.inspectionWindowEndsAt : undefined,
        source: typeof entry.source === "string" ? entry.source : undefined,
        conditionNotes: typeof entry.conditionNotes === "string" ? entry.conditionNotes : undefined,
        createdAt: typeof entry.createdAt === "string" ? entry.createdAt : undefined,
        status: typeof entry.status === "string" ? entry.status : undefined,
        product: typeof entry.product === "string" ? entry.product : undefined,
        groupName: typeof entry.groupName === "string" ? entry.groupName : undefined,
        quantity: typeof entry.quantity === "number" ? entry.quantity : undefined,
        shipDate: typeof entry.shipDate === "string" ? entry.shipDate : undefined,
        expectedDeliveryAt: typeof entry.expectedDeliveryAt === "string" ? entry.expectedDeliveryAt : undefined
      };
    })
  };
}

export async function fetchClaims(): Promise<ClaimRecord[]> {
  const payload = await getJson("/api/v1/support/claims");
  if (!isRecord(payload) || !Array.isArray(payload.claims)) return [];
  return payload.claims as ClaimRecord[];
}

export async function submitDamageClaim(input: {
  clanId: string;
  memberId: string;
  orderId: string;
  captureId: string;
  damagedUnits: number;
  unitPrice: number;
  orderValue: number;
  evidence: { photoUrls: string[]; description: string };
}): Promise<ClaimReceipt> {
  const response = await fetch("/api/v1/support/claims", {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify(input)
  });
  const payload: unknown = await readJsonResponse(response);
  if (!response.ok) {
    const message = isRecord(payload) && typeof payload.error === "string" ? payload.error : `Claim request failed (${response.status}).`;
    throw new Error(message);
  }
  if (!isRecord(payload) || !isRecord(payload.claim)) throw new Error("The server returned an invalid claim receipt.");
  return {
    claimId: requireString(payload.claim, "claimId"),
    status: requireString(payload.claim, "status")
  };
}

export interface McpToolDeclaration {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
}

export async function fetchMcpTools(): Promise<McpToolDeclaration[]> {
  const payload = await getJson("/api/v1/mcp/tools");
  if (!isRecord(payload) || !Array.isArray(payload.tools)) return [];
  return payload.tools as McpToolDeclaration[];
}

export async function executeMcpAction(tool: string, args: Record<string, unknown> = {}): Promise<unknown> {
  return postJson("/api/v1/mcp/execute", { tool, args });
}

export async function postUserSettings(settings: Record<string, unknown>): Promise<unknown> {
  return postJson("/api/v1/user/settings", settings);
}

export interface KernelSupplierTier {
  vendorUrl: string;
  tiers: Array<string | string[]>;
  credibility: string;
  proofSha256: string | null;
  proofFile: string | null;
}

export interface KernelBrief {
  id: string;
  clanId: string;
  sku: string;
  researchedAt: string;
  suppliers: KernelSupplierTier[];
  forex?: { base: string; target: string; data: string; proofSha256?: string; proofFile?: string } | null;
  status: "DONE" | "FAILED" | "UNAVAILABLE" | "QUEUED";
  error?: string;
}

export interface GovernanceConstitution {
  coalitionId: string;
  version: number;
  rules: {
    INSPECTION_WINDOW_HOURS: number;
    SILENCE_AUTO_CONFIRM_HOURS: number;
    DAMAGE_EVIDENCE_REQUIREMENT: string;
    STEP_UP_THRESHOLD_USD: number;
    VOTING_WEIGHT_STRATEGY: string;
    DISPUTE_ESCALATION_WINDOW_HOURS: number;
    MIN_DISCOUNT_PERCENT: number;
    META_GOVERNANCE_PROCEDURE: string;
  };
  founderSmeId?: string;
  founderVetoRules?: string[];
  templateId?: string;
  chosenSupplier?: string;
  updatedAt: string;
}

export interface GovernanceProposalRecord {
  id: string;
  coalitionId: string;
  proposerSmeId: string;
  ruleType: string;
  proposedValue: string | number;
  previousValue: string | number;
  rationale: string;
  briefId?: string;
  status: "OPEN" | "ENACTED" | "REJECTED" | "EXPIRED";
  createdAt: string;
  votingDeadline: string;
  quorumThreshold: number;
  majorityThreshold: number;
  weightStrategy: string;
  requiresFounderVetoApproval?: boolean;
  founderApproved?: boolean;
}

export async function fetchKernelBrief(clanId: string): Promise<KernelBrief | null> {
  const payload = await getJson(`/api/v1/kernel/briefs?clanId=${encodeURIComponent(clanId)}`);
  if (!isRecord(payload)) return null;
  return (payload.brief as KernelBrief) || null;
}

export async function requestKernelResearch(input: { clanId: string; sku?: string; vendorUrls?: string[]; force?: boolean }): Promise<unknown> {
  return postJson("/api/v1/kernel/research", input);
}

export async function fetchClanGovernance(clanId: string): Promise<{ constitution: GovernanceConstitution; proposals: GovernanceProposalRecord[] }> {
  const payload = await getJson(`/api/v1/governance/constitution?coalitionId=${encodeURIComponent(clanId)}`);
  if (!isRecord(payload)) throw new Error("Invalid governance response.");
  return {
    constitution: payload.constitution as GovernanceConstitution,
    proposals: (Array.isArray(payload.proposals) ? payload.proposals : []) as GovernanceProposalRecord[]
  };
}

export async function proposeGovernanceRule(input: {
  coalitionId: string;
  proposerSmeId: string;
  ruleType: string;
  proposedValue: string | number;
  rationale: string;
  briefId?: string;
}): Promise<unknown> {
  return postJson("/api/v1/governance/propose", input);
}

export async function castGovernanceVote(input: {
  proposalId: string;
  coalitionId: string;
  smeId: string;
  choice: "AFFIRMATIVE" | "NEGATIVE";
}): Promise<unknown> {
  return postJson("/api/v1/governance/vote", input);
}

export async function tallyGovernanceProposal(input: {
  proposalId: string;
  coalitionId: string;
  forceEarly?: boolean;
}): Promise<unknown> {
  return postJson("/api/v1/governance/tally", input);
}

export async function createClanWithGovernance(input: {
  clanName: string;
  commoditySku: string;
  targetUnits: number;
  basePriceUsd: number;
  pricingTiers?: Array<{ tier: number; minUnits: number; discountPct: number }>;
  templateId?: string;
  constitution?: Record<string, unknown>;
  vendorUrls?: string[];
  city?: string;
  countryCode?: string;
  fulfilment?: { mode: "SINGLE_POINT" | "MULTIPLE_POINTS"; points: Array<{ label: string; address: string; city: string }> };
}): Promise<unknown> {
  return postJson("/api/v1/clan/create", input);
}

export async function fetchUserSettings(): Promise<any> {
  return getJson("/api/v1/user/settings");
}

export async function saveUserSettingsApi(settings: Record<string, unknown>): Promise<any> {
  return postJson("/api/v1/user/settings", settings);
}


export interface EvidenceRecord {
  evidenceId: string;
  uri: string;
  fileName: string;
  mimeType: string;
  bytes: number;
  storage: string;
  detectedTrackingNumbers: string[];
}

export async function uploadEvidence(file: File, clanId?: string): Promise<EvidenceRecord> {
  const dataBase64: string = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
    reader.onerror = () => reject(new Error("Could not read the photo."));
    reader.readAsDataURL(file);
  });
  const response = await fetch("/api/v1/evidence/upload", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ fileName: file.name, mimeType: file.type, dataBase64, clanId })
  });
  const payload = (await response.json()) as { evidence?: EvidenceRecord; error?: string };
  if (!response.ok || !payload.evidence) throw new Error(payload.error ?? `Upload failed (${response.status}).`);
  return payload.evidence;
}

// ---- PayPal hub: invoices, disputes, dues, delivery and exit ----
export interface ToolkitInvoice { id: string; status: string; invoiceNumber: string; date: string; email: string; amount: string; due: string; currency: string; note: string; }
export interface ToolkitDispute { id: string; status: string; reason: string; amount: string; currency: string; created: string; }

function parseToolkitResult(payload: unknown): Record<string, unknown> {
  if (!isRecord(payload)) throw new Error("Invalid PayPal response.");
  const raw = payload.result;
  const parsed: unknown = typeof raw === "string" ? JSON.parse(raw) : raw;
  if (!isRecord(parsed)) throw new Error("PayPal returned an unexpected result.");
  if (isRecord(parsed.error)) throw new Error(typeof parsed.error.message === "string" ? parsed.error.message : "PayPal returned an error.");
  return parsed;
}

export async function paypalToolkit(action: string, parameters: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
  return parseToolkitResult(await postJson("/api/v1/paypal/toolkit", { action, parameters }));
}

export async function fetchPayPalInvoices(): Promise<ToolkitInvoice[]> {
  const result = await paypalToolkit("list_invoices", {});
  const items = Array.isArray(result.items) ? result.items : [];
  return items.filter(isRecord).map((item) => {
    const detail = isRecord(item.detail) ? item.detail : {};
    const amount = isRecord(item.amount) ? item.amount : {};
    const due = isRecord(item.due_amount) ? item.due_amount : {};
    const recipients = Array.isArray(item.primary_recipients) ? item.primary_recipients : [];
    const billing = recipients.length && isRecord(recipients[0]) && isRecord(recipients[0].billing_info) ? recipients[0].billing_info : {};
    return {
      id: String(item.id ?? ""), status: String(item.status ?? "UNKNOWN"), invoiceNumber: String(detail.invoice_number ?? ""),
      date: String(detail.invoice_date ?? ""), email: String(billing.email_address ?? ""), amount: String(amount.value ?? "0.00"),
      due: String(due.value ?? amount.value ?? "0.00"), currency: String(amount.currency_code ?? "USD"), note: String(detail.note ?? "")
    };
  });
}

export async function sendInvoiceReminder(invoiceId: string): Promise<void> {
  await paypalToolkit("send_invoice_reminder", { invoice_id: invoiceId, subject: "Payment reminder from WholeShare", note: "This is a friendly reminder about your open WholeShare invoice." });
}

export async function fetchPayPalDisputes(): Promise<ToolkitDispute[]> {
  const result = await paypalToolkit("list_disputes", {});
  const items = Array.isArray(result.items) ? result.items : [];
  return items.filter(isRecord).map((item) => {
    const amount = isRecord(item.dispute_amount) ? item.dispute_amount : {};
    return { id: String(item.dispute_id ?? ""), status: String(item.status ?? ""), reason: String(item.reason ?? ""), amount: String(amount.value ?? ""), currency: String(amount.currency_code ?? "USD"), created: String(item.create_time ?? "") };
  });
}

export interface LiquiditySummary { outstandingDebtCents: number; status: string; unpaidInvoices: number; details: string; }
export async function fetchLiquidity(autoRemind = false): Promise<LiquiditySummary> {
  const payload = await getJson(`/api/v1/buyer/liquidity?autoRemind=${autoRemind}`);
  if (!isRecord(payload) || !isRecord(payload.liquidity)) throw new Error("Invalid liquidity response.");
  return { outstandingDebtCents: Number(payload.outstandingDebtCents ?? 0), status: String(payload.liquidity.status ?? "UNKNOWN"), unpaidInvoices: Number(payload.liquidity.totalUnpaidInvoices ?? 0), details: String(payload.liquidity.details ?? "") };
}

export interface JoinedGroup { clanId: string; groupId: string; authorizationId: string | null; captureId: string | null; skuName: string; clanStatus: string; pledgedUnits: number; authorizedUsd: string; memberStatus: string; paypalOrderId: string | null; }
export interface DebtRecord { debtId?: string; id?: string; clanId?: string; amountCents?: number; status?: string; reason?: string; }
export interface UserOverview { businessName: string; kybStatus: string; joinedClans: JoinedGroup[]; outstandingDebts: DebtRecord[]; metrics: Record<string, string | number>; }
export async function markSupplierDelivered(clanId: string): Promise<void> {
  await postJson("/api/v1/demo/supplier-delivered", { clanId });
}

export async function acceptGoods(clanId: string): Promise<{ captureId?: string; amountCents: number; alreadyReleased?: boolean }> {
  const payload = await postJson("/api/v1/shipment/accept", { clanId });
  return payload as { captureId?: string; amountCents: number; alreadyReleased?: boolean };
}

export async function fetchUserOverview(): Promise<UserOverview> {
  const payload = await getJson("/api/v1/user/overview");
  if (!isRecord(payload) || !isRecord(payload.profile)) throw new Error("Invalid overview response.");
  const clans = Array.isArray(payload.joinedClans) ? payload.joinedClans.filter(isRecord) : [];
  return {
    businessName: String(payload.profile.businessName ?? ""), kybStatus: String(payload.profile.kybStatus ?? ""),
    joinedClans: clans.map((c) => ({ clanId: String(c.clanId), groupId: String(c.groupId ?? c.clanId), authorizationId: typeof c.authorizationId === "string" ? c.authorizationId : null, captureId: typeof c.captureId === "string" ? c.captureId : null, skuName: String(c.skuName ?? c.sku ?? ""), clanStatus: String(c.clanStatus ?? ""), pledgedUnits: Number(c.pledgedUnits ?? 0), authorizedUsd: String(c.authorizedUsd ?? "0.00"), memberStatus: String(c.memberStatus ?? ""), paypalOrderId: typeof c.paypalOrderId === "string" ? c.paypalOrderId : null })),
    outstandingDebts: Array.isArray(payload.outstandingDebts) ? (payload.outstandingDebts.filter(isRecord) as DebtRecord[]) : [],
    metrics: isRecord(payload.metrics) ? (payload.metrics as Record<string, string | number>) : {}
  };
}

export async function evaluateGroupExit(coalitionId: string, smeId = ""): Promise<{ canExitImmediately: boolean; exitStatus: string; lockedEscrowCents: number; unsettledDebtCents: number; message: string }> {
  const payload = await postJson("/api/v1/clan/exit/evaluate", { coalitionId, smeId });
  const e = isRecord(payload) && isRecord(payload.evaluation) ? payload.evaluation : {};
  return { canExitImmediately: Boolean(e.canExitImmediately), exitStatus: String(e.exitStatus ?? ""), lockedEscrowCents: Number(e.lockedEscrowCents ?? 0), unsettledDebtCents: Number(e.unsettledDebtCents ?? 0), message: String(e.message ?? "") };
}

export async function leaveGroup(coalitionId: string, reason: string, smeId = ""): Promise<string> {
  const payload = await postJson("/api/v1/clan/leave", { coalitionId, smeId, reason });
  return isRecord(payload) && typeof payload.message === "string" ? payload.message : "You have left the group.";
}

export async function settleDebt(debtId: string): Promise<void> { await postJson("/api/v1/user/dues/settle", { debtId }); }

export async function confirmDelivery(input: { orderId?: string; coalitionId?: string; conditionStatus: "GOOD_CONDITION" | "DAMAGED"; notes: string; photoBase64?: string }): Promise<string> {
  const payload = await postJson("/api/v1/shipment/confirm-receipt", input);
  return isRecord(payload) && typeof payload.message === "string" ? payload.message : "Delivery recorded.";
}

export async function approveClaim(claimId: string, memberId: string): Promise<void> { await postJson("/api/v1/support/claims/approve", { claimId, memberId }); }
export async function respondToClaim(input: { claimId: string; action: "ACCEPT" | "COUNTER" | "REJECT"; notes: string; counterAmount?: number }): Promise<void> { await postJson("/api/v1/support/claims/respond", input); }

export async function runAgentTool(tool: string, args: Record<string, unknown>): Promise<Record<string, unknown>> {
  const payload = await postJson("/api/v1/agent/action", { tool, args });
  if (!isRecord(payload)) throw new Error("Unexpected tool response.");
  if (typeof payload.error === "string") throw new Error(payload.error);
  return payload;
}

// ---- PayPal connection (Log in with PayPal) ----
export interface PayPalConnection { connected: boolean; email: string; payerId: string; connectedAt: string; mode: string; configured: boolean; }

export async function fetchPayPalConnection(): Promise<PayPalConnection> {
  const payload = await getJson("/api/v1/paypal/connect/status");
  if (!isRecord(payload)) throw new Error("Invalid PayPal connection response.");
  return { connected: Boolean(payload.connected), email: String(payload.email ?? ""), payerId: String(payload.payerId ?? ""), connectedAt: String(payload.connectedAt ?? ""), mode: String(payload.mode ?? "sandbox"), configured: Boolean(payload.configured) };
}

export async function startPayPalConnect(): Promise<{ authorizeUrl: string; redirectUri: string }> {
  const payload = await getJson("/api/v1/paypal/connect/start");
  if (!isRecord(payload) || typeof payload.authorizeUrl !== "string") throw new Error("PayPal did not return a sign-in link.");
  return { authorizeUrl: payload.authorizeUrl, redirectUri: String(payload.redirectUri ?? "") };
}

export async function disconnectPayPalApi(): Promise<PayPalConnection> {
  await postJson("/api/v1/paypal/connect/disconnect");
  return fetchPayPalConnection();
}
