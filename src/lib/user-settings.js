import { mosaicBaseUrl } from "./mosaic-config.js";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { actionDispatcher } from "./web-actions.js";
import { getRepaymentStorage } from "../storage/repayment.storage.ts";

const SETTINGS_FILE_PATH = resolve(process.cwd(), "data/user_settings.json");

const LEGACY_DEMO_AGENT_IDS = new Set(["agent_copilot_01", "agent_grok_02", "agent_instinct_03", "agent_muse_04"]);

const DEFAULT_SETTINGS = {
  profile: {
    smeId: "sme_austin_01",
    businessName: "",
    industry: "",
    ein: "",
    contactEmail: "",
    city: "",
    country: "",
    currency: "USD",
    timezone: "America/Chicago",
    paypalMerchantEmail: "",
    paypalPayerId: "",
    paypalConnectedAt: "",
    paypalConnectMode: "",
    kybStatus: "NOT_STARTED"
  },
  appearance: {
    theme: "light",
    density: "comfortable",
    reducedMotion: "system"
  },
  policies: {
    perPledgeSpendLimitUsd: 2500.0,
    approvalThresholdUsd: 1000.0,
    dailySpendLimitUsd: 5000.0,
    maxAutoAuthorizeUsd: 1500.0,
    stepUpThresholdUsd: 1000.0,
    payoutDestination: "",
    invoiceCurrency: "USD",
    preferredCurrency: "USD"
  },
  notifications: {
    groupFilledInApp: true,
    groupFilledEmail: true,
    deliveryConfirmedInApp: true,
    deliveryConfirmedEmail: true,
    disputeUpdateInApp: true,
    disputeUpdateEmail: true,
    supplierResearchReadyInApp: true,
    supplierResearchReadyEmail: false,
    approvalRequestedInApp: true,
    approvalRequestedEmail: true,
    inviteAcceptedInApp: true,
    inviteAcceptedEmail: false
  },
  groupDefaults: {
    defaultTemplate: "EQUAL_COOP",
    defaultInspectionWindowHours: 48,
    defaultDisputeWindowHours: 48,
    minDiscountPercent: 20
  },
  agentPermissions: {
    model: "local_qwen",
    allowAutonomousQuotePrep: false,
    allowAutonomousFilterSort: false,
    allowAutonomousDraftMessages: false,
    allowAutonomousResearch: false,
    allowAutonomousScheduleChanges: false,
    requireApprovalMoneyMovement: true,
    requireApprovalSignatures: true,
    requireApprovalClanCreation: true,
    externalAgentAccessEnabled: false,
    externalAgentAccessPerClan: false
  },
  approvalsAndSignatures: {
    signatureMethod: "IN_APP",
    documentRetention: "3_YEARS"
  },
  documentsAndIdentity: {
    uploadedDocuments: [],
    supplierSharePolicy: "EXPLICIT_ONLY"
  },
  dataPrivacy: {
    connectedPaypalEmail: "",
    connectedStatus: "NOT_CONNECTED",
    lastExportAt: null
  },
  accessibility: {
    textSize: "standard",
    reducedMotion: "system"
  },
  aiAgents: [],
  modelPreferences: {
    provider: "local_mlx",
    cloudModel: "",
    localModelUrl: mosaicBaseUrl(),
    reasoningBudget: 600,
    maxTurns: 2
  }
};

export function loadUserSettings() {
  try {
    if (existsSync(SETTINGS_FILE_PATH)) {
      const data = JSON.parse(readFileSync(SETTINGS_FILE_PATH, "utf-8"));
      return {
        profile: { ...DEFAULT_SETTINGS.profile, ...(data.profile || {}) },
        appearance: { ...DEFAULT_SETTINGS.appearance, ...(data.appearance || {}) },
        policies: { ...DEFAULT_SETTINGS.policies, ...(data.policies || {}) },
        notifications: { ...DEFAULT_SETTINGS.notifications, ...(data.notifications || {}) },
        groupDefaults: { ...DEFAULT_SETTINGS.groupDefaults, ...(data.groupDefaults || {}) },
        agentPermissions: { ...DEFAULT_SETTINGS.agentPermissions, ...(data.agentPermissions || {}) },
        approvalsAndSignatures: { ...DEFAULT_SETTINGS.approvalsAndSignatures, ...(data.approvalsAndSignatures || {}) },
        documentsAndIdentity: { ...DEFAULT_SETTINGS.documentsAndIdentity, ...(data.documentsAndIdentity || {}) },
        dataPrivacy: { ...DEFAULT_SETTINGS.dataPrivacy, ...(data.dataPrivacy || {}) },
        accessibility: { ...DEFAULT_SETTINGS.accessibility, ...(data.accessibility || {}) },
        aiAgents: Array.isArray(data.aiAgents) ? data.aiAgents.filter((agent) => !LEGACY_DEMO_AGENT_IDS.has(agent.id)) : DEFAULT_SETTINGS.aiAgents,
        modelPreferences: { ...DEFAULT_SETTINGS.modelPreferences, ...(data.modelPreferences || {}) }
      };
    }
  } catch {
    // Fall back to defaults
  }
  return JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
}

export function saveUserSettings(settings) {
  writeFileSync(SETTINGS_FILE_PATH, JSON.stringify(settings, null, 2), "utf-8");
}

export function updateUserSettings(partialUpdate) {
  const current = loadUserSettings();

  const sections = [
    "profile",
    "appearance",
    "policies",
    "notifications",
    "groupDefaults",
    "agentPermissions",
    "approvalsAndSignatures",
    "documentsAndIdentity",
    "dataPrivacy",
    "accessibility",
    "modelPreferences"
  ];

  for (const sec of sections) {
    if (partialUpdate[sec] && typeof partialUpdate[sec] === "object") {
      current[sec] = {
        ...current[sec],
        ...partialUpdate[sec]
      };
    }
  }

  if (Array.isArray(partialUpdate.aiAgents)) {
    current.aiAgents = partialUpdate.aiAgents;
  }

  saveUserSettings(current);
  return current;
}

export function addAgentConnection({ name, role, protocol, maxSpendUsd, autonomousApproval }) {
  const current = loadUserSettings();
  const id = `agent_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
  const newAgent = {
    id,
    name: name || "Custom External Agent",
    role: role || "Autonomous Procurement Delegate",
    protocol: protocol || "REST",
    status: "ACTIVE",
    maxSpendUsd: Number(maxSpendUsd) || 500,
    autonomousApproval: Boolean(autonomousApproval)
  };

  current.aiAgents.push(newAgent);
  saveUserSettings(current);
  return newAgent;
}

export function removeAgentConnection(agentId) {
  const current = loadUserSettings();
  current.aiAgents = current.aiAgents.filter(a => a.id !== agentId);
  saveUserSettings(current);
  return current.aiAgents;
}

export function getUserDashboardOverview(smeId = "sme_austin_01") {
  const settings = loadUserSettings();
  const repaymentStorage = getRepaymentStorage();
  const outstandingDebtCents = repaymentStorage.getOutstandingDebtTotalCents(smeId);
  const outstandingDebtsList = repaymentStorage.getMemberDebts(smeId).filter(d => d.status === "OUTSTANDING");

  const joinedClans = [];
  let totalAuthorizedCents = 0;
  let totalSavingsUsd = 0;

  for (const clan of actionDispatcher.coalitions.values()) {
    if (Array.isArray(clan.members)) {
      const member = clan.members.find(m => m.smeId === smeId);
      if (member) {
        totalAuthorizedCents += member.authorizedCents || 0;
        const catalogItem = actionDispatcher.catalog.get(clan.sku);
        const retailUnitPrice = catalogItem?.basePriceUsd || 10;
        const actualUnitPrice = (clan.unitPriceCents || 1000) / 100;
        const savingsPerUnit = Math.max(0, retailUnitPrice - actualUnitPrice);
        const clanSavings = savingsPerUnit * member.pledgedUnits;
        totalSavingsUsd += clanSavings;

        joinedClans.push({
          clanId: clan.id,
          sku: clan.sku,
          skuName: clan.skuName || catalogItem?.name || clan.sku,
          category: catalogItem?.category || "GENERAL",
          clanStatus: clan.status,
          pledgedUnits: member.pledgedUnits,
          authorizedCents: member.authorizedCents,
          authorizedUsd: ((member.authorizedCents || 0) / 100).toFixed(2),
          memberStatus: member.status,
          paypalOrderId: member.paypalOrderId,
          trackingNumber: clan.trackingNumber || null,
          carrier: clan.carrier || null,
          discountTierPct: clan.discountTierPct || 0
        });
      }
    }
  }

  const dailySpendLimitCents = Math.round(settings.policies.dailySpendLimitUsd * 100);
  const availableSpendHeadroomCents = Math.max(0, dailySpendLimitCents - totalAuthorizedCents);

  return {
    profile: settings.profile,
    policies: settings.policies,
    metrics: {
      joinedClansCount: joinedClans.length,
      totalEscrowAuthorizedUsd: (totalAuthorizedCents / 100).toFixed(2),
      totalSavingsUsd: totalSavingsUsd.toFixed(2),
      outstandingDuesUsd: (outstandingDebtCents / 100).toFixed(2),
      availableSpendHeadroomUsd: (availableSpendHeadroomCents / 100).toFixed(2)
    },
    joinedClans,
    outstandingDebts: outstandingDebtsList,
    aiAgents: settings.aiAgents,
    modelPreferences: settings.modelPreferences
  };
}

