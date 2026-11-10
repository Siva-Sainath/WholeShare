import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import crypto from "node:crypto";
import { createSharedPaymentToken } from "./token.js";
import { interceptNegotiationProposal } from "./interceptor.js";
import { proposeCoalitionAllocation } from "./model-runner.js";
import { transitionCoalitionState } from "./fsm.js";
import { generateInvoiceWithQr } from "./paypal-bridge.js";
import { getRepaymentStorage } from "../storage/repayment.storage.ts";
import { getClanGovernanceAdapter } from "../adapter/clan-governance.adapter.ts";
import { DEFAULT_CLAN_RULES, GovernanceError } from "../domain/clan-governance.ts";

const catalogPath = resolve(process.cwd(), "data/processed/wholesale_catalog.json");
const personasPath = resolve(process.cwd(), "data/processed/sme_personas.json");

let initialCatalog = [];
let initialPersonas = [];

try {
  initialCatalog = JSON.parse(readFileSync(catalogPath, "utf-8"));
  initialPersonas = JSON.parse(readFileSync(personasPath, "utf-8"));
} catch {
  initialCatalog = [
    {
      sku: "organic-flour-50lb",
      name: "Golden Fields Organic Flour (50 lb Bag)",
      basePriceUsd: 10,
      tiers: [
        { tier: 1, minUnits: 100, priceUsd: 10, discountPct: 0 },
        { tier: 2, minUnits: 500, priceUsd: 7.2, discountPct: 28 },
        { tier: 3, minUnits: 1000, priceUsd: 5.8, discountPct: 42 }
      ]
    }
  ];
  initialPersonas = [
    { id: "sme_austin_01", businessName: "Austin Artisan Bakery", maxAutoAuthorizeUsd: 1500, creditTier: "A" },
    { id: "sme_bean_02", businessName: "Bean & Leaf Coffee Roasters", maxAutoAuthorizeUsd: 3000, creditTier: "A" },
    { id: "sme_green_03", businessName: "GreenLeaf Organics Cafe", maxAutoAuthorizeUsd: 1000, creditTier: "A" }
  ];
}

class WholeshareActionDispatcher {
  constructor() {
    this.smes = new Map();
    this.coalitions = new Map();
    this.catalog = new Map();
    this.eventLog = [];
    this.sseClients = new Set();
    this.listeners = new Set();
    this.coalitionLocks = new Map();
    this.resetState();
  }

  async withLock(key, fn) {
    while (this.coalitionLocks.has(key)) {
      await this.coalitionLocks.get(key);
    }
    let resolveLock;
    const lockPromise = new Promise(resolve => { resolveLock = resolve; });
    this.coalitionLocks.set(key, lockPromise);
    try {
      return await fn();
    } finally {
      this.coalitionLocks.delete(key);
      resolveLock();
    }
  }

  resetState() {
    this.smes.clear();
    this.coalitions.clear();
    this.catalog.clear();
    this.eventLog = [];

    for (const item of initialCatalog) {
      this.catalog.set(item.sku, item);
    }

    if (!this.catalog.has("organic-flour-50lb")) {
      this.catalog.set("organic-flour-50lb", {
        sku: "organic-flour-50lb",
        name: "Golden Fields Organic Flour (50 lb Bag)",
        basePriceUsd: 10,
        tiers: [
          { tier: 1, minUnits: 100, priceUsd: 10, discountPct: 0 },
          { tier: 2, minUnits: 500, priceUsd: 7.2, discountPct: 28 },
          { tier: 3, minUnits: 1000, priceUsd: 5.8, discountPct: 42 }
        ]
      });
    }

    for (const p of initialPersonas) {
      this.smes.set(p.id, {
        id: p.id,
        name: p.businessName,
        maxAutoAuthorizeCents: (p.maxAutoAuthorizeUsd || 1000) * 100,
        stepUpThresholdCents: 100000,
        status: "VERIFIED_KYB",
        registeredAt: new Date().toISOString()
      });
    }

    // Seed initial active demonstration coalition
    const defaultSku = "organic-flour-50lb";
    const catalogItem = this.catalog.get(defaultSku);
    const coalitionId = "coalition_flour_01";

    this.coalitions.set(coalitionId, {
      id: coalitionId,
      sku: defaultSku,
      skuName: catalogItem?.name || "Organic Hard Red Wheat Flour (50 lb Bag)",
      targetUnits: 500,
      currentUnits: 300,
      unitPriceCents: 1000,
      discountTierPct: 0,
      status: "FORMING",
      leaderId: "sme_austin_01",
      originPort: "Kansas City Rail Depot",
      destinationPort: "Austin Logistics Center",
      subscription: {
        monthlyDuesUsd: 49,
        yearlyDuesUsd: 499,
        commitmentTerm: "1_YEAR",
        cancellationNoticeDays: 30,
        updatedAt: new Date().toISOString()
      },
      members: [
        {
          smeId: "sme_austin_01",
          name: "Austin Artisan Bakery",
          pledgedUnits: 150,
          authorizedCents: 150000,
          status: "PLEDGED",
          stepUpRequired: false,
          paypalOrderId: null,
          invoiceQrUrl: null
        },
        {
          smeId: "sme_bean_02",
          name: "Bean & Leaf Coffee Roasters",
          pledgedUnits: 150,
          authorizedCents: 150000,
          status: "PLEDGED",
          stepUpRequired: false,
          paypalOrderId: null,
          invoiceQrUrl: null
        }
      ],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });

    const coffeeSku = "specialty-coffee-green-60kg";
    const coffeeItem = this.catalog.get(coffeeSku);
    const coffeeId = "coalition_coffee_02";
    this.coalitions.set(coffeeId, {
      id: coffeeId,
      sku: coffeeSku,
      skuName: coffeeItem?.name || "Ethiopian Yirgacheffe Grade 1 Green Coffee (60 kg Sack)",
      targetUnits: 10,
      currentUnits: 12,
      unitPriceCents: 40800,
      discountTierPct: 15,
      status: "LOCKED",
      trackingNumber: "1Z9999999999999999",
      carrier: "UPS",
      members: [
        {
          smeId: "sme_bean_02",
          name: "Bean & Leaf Coffee Roasters",
          pledgedUnits: 6,
          authorizedCents: 244800,
          status: "AUTHORIZED",
          stepUpRequired: false,
          paypalOrderId: "2WW5818956976991R",
          invoiceQrUrl: null
        },
        {
          smeId: "sme_green_03",
          name: "GreenLeaf Organics Cafe",
          pledgedUnits: 6,
          authorizedCents: 244800,
          status: "AUTHORIZED",
          stepUpRequired: false,
          paypalOrderId: "7GH1234567890123A",
          invoiceQrUrl: null
        }
      ],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });

    const tilesSku = "porcelain-matte-tiles-24x24";
    const tilesItem = this.catalog.get(tilesSku);
    const tilesId = "coalition_tiles_03";
    this.coalitions.set(tilesId, {
      id: tilesId,
      sku: tilesSku,
      skuName: tilesItem?.name || "Commercial Grade 4 Matte Porcelain Floor Tiles (Pallet 480 sq ft)",
      targetUnits: 15,
      currentUnits: 8,
      unitPriceCents: 85000,
      discountTierPct: 0,
      status: "FORMING",
      members: [
        {
          smeId: "sme_austin_01",
          name: "Austin Artisan Bakery",
          pledgedUnits: 4,
          authorizedCents: 340000,
          status: "PLEDGED",
          stepUpRequired: false,
          paypalOrderId: null,
          invoiceQrUrl: null
        },
        {
          smeId: "sme_green_03",
          name: "GreenLeaf Organics Cafe",
          pledgedUnits: 4,
          authorizedCents: 340000,
          status: "PLEDGED",
          stepUpRequired: false,
          paypalOrderId: null,
          invoiceQrUrl: null
        }
      ],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });

    const boxesSku = "corrugated-boxes-12x12x12";
    const boxesItem = this.catalog.get(boxesSku);
    const boxesId = "coalition_boxes_04";
    this.coalitions.set(boxesId, {
      id: boxesId,
      sku: boxesSku,
      skuName: boxesItem?.name || "Heavy-Duty 200# ECT-32 Kraft Shipping Boxes (Bundle of 25)",
      targetUnits: 100,
      currentUnits: 150,
      unitPriceCents: 2730,
      discountTierPct: 22,
      status: "LOCKED",
      trackingNumber: "9400111899562537628834",
      carrier: "USPS",
      members: [
        {
          smeId: "sme_austin_01",
          name: "Austin Artisan Bakery",
          pledgedUnits: 75,
          authorizedCents: 204750,
          status: "AUTHORIZED",
          stepUpRequired: false,
          paypalOrderId: "4KL9876543210987B",
          invoiceQrUrl: null
        },
        {
          smeId: "sme_bean_02",
          name: "Bean & Leaf Coffee Roasters",
          pledgedUnits: 75,
          authorizedCents: 204750,
          status: "AUTHORIZED",
          stepUpRequired: false,
          paypalOrderId: "8MN6543210987654C",
          invoiceQrUrl: null
        }
      ],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });

    const hardwareSku = "stainless-fasteners-316";
    const hardwareItem = this.catalog.get(hardwareSku);
    const hardwareId = "coalition_hardware_05";
    this.coalitions.set(hardwareId, {
      id: hardwareId,
      sku: hardwareSku,
      skuName: hardwareItem?.name || "Marine Grade 316 Stainless Hex Bolts & Nuts (Case of 500)",
      targetUnits: 80,
      currentUnits: 40,
      unitPriceCents: 12000,
      discountTierPct: 0,
      status: "FORMING",
      members: [
        {
          smeId: "sme_green_03",
          name: "GreenLeaf Organics Cafe",
          pledgedUnits: 40,
          authorizedCents: 480000,
          status: "PLEDGED",
          stepUpRequired: false,
          paypalOrderId: null,
          invoiceQrUrl: null
        }
      ],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });

    const vanillaId = "coalition_vanilla_06";
    this.coalitions.set(vanillaId, {
      id: vanillaId,
      sku: "madagascar-vanilla",
      skuName: "Madagascar Vanilla Syndicate",
      targetUnits: 250,
      currentUnits: 0,
      unitPriceCents: 4500,
      discountTierPct: 0,
      status: "FORMING",
      members: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });

    // Hydrate 750+ Pre-Seeded Clans & Members from data/processed
    try {
      const clansUniversePath = resolve(process.cwd(), "data/processed/clans_universe.json");
      const membersUniversePath = resolve(process.cwd(), "data/processed/clan_members_universe.json");
      if (existsSync(clansUniversePath) && existsSync(membersUniversePath)) {
        const rawClans = JSON.parse(readFileSync(clansUniversePath, "utf-8"));
        const rawMembers = JSON.parse(readFileSync(membersUniversePath, "utf-8"));
        const membersByClan = new Map();
        for (const m of rawMembers) {
          if (!membersByClan.has(m.clanId)) membersByClan.set(m.clanId, []);
          membersByClan.get(m.clanId).push({
            smeId: m.smeId,
            name: m.smeId,
            pledgedUnits: m.pledgedUnits,
            authorizedCents: m.authorizedCents,
            currency: m.currency,
            status: m.status,
            stepUpRequired: m.stepUpRequired,
            paypalOrderId: m.paypalOrderId || null,
            invoiceQrUrl: m.qrCodeUrl || null
          });
        }

        for (const c of rawClans) {
          const catItem = this.catalog.get(c.sku);
          this.coalitions.set(c.id, {
            id: c.id,
            sku: c.sku,
            skuName: catItem?.name || c.sku,
            targetUnits: c.targetUnits,
            currentUnits: c.currentUnits,
            unitPriceCents: c.unitPriceCents,
            discountTierPct: Number(c.discountTierPct) || 0,
            status: c.status,
            leaderId: c.leaderId,
            corridorId: c.corridorId,
            industryVertical: c.industryVertical,
            capacityRatio: c.capacityRatio,
            members: membersByClan.get(c.id) || [],
            createdAt: c.createdAt || new Date().toISOString(),
            updatedAt: c.updatedAt || new Date().toISOString()
          });
        }
      }
    } catch {
      // Continue with base demonstration clans
    }
  }

  broadcast(eventType, payload) {
    const event = {
      id: `evt_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      type: eventType,
      payload,
      timestamp: new Date().toISOString()
    };

    this.eventLog.push(event);

    if (this.listeners) {
      for (const listener of this.listeners) {
        try {
          listener(event);
        } catch {
          // Ignore listener errors
        }
      }
    }

    const message = `event: ${eventType}\ndata: ${JSON.stringify(event)}\n\n`;
    for (const client of this.sseClients) {
      try {
        client.write(message);
      } catch {
        this.sseClients.delete(client);
      }
    }

    return event;
  }

  onEvent(listener) {
    if (!this.listeners) this.listeners = new Set();
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  subscribeSse(res) {
    this.sseClients.add(res);
    res.write(`event: CONNECTED\ndata: ${JSON.stringify({ status: "CONNECTED", clientCount: this.sseClients.size })}\n\n`);
  }

  unsubscribeSse(res) {
    this.sseClients.delete(res);
  }

  spawnSme({ id, name, maxAutoAuthorizeUsd, stepUpThresholdUsd, sku, pledgedUnits }) {
    const smeId = id || `sme_${Date.now()}`;
    const sme = {
      id: smeId,
      name: name || "New SME Member",
      maxAutoAuthorizeCents: (maxAutoAuthorizeUsd || 1000) * 100,
      stepUpThresholdCents: (stepUpThresholdUsd || 1000) * 100,
      status: "VERIFIED_KYB",
      registeredAt: new Date().toISOString()
    };

    this.smes.set(smeId, sme);

    const token = createSharedPaymentToken({
      buyerId: smeId,
      sku: sku || "organic-flour-50lb",
      maxSpendCents: sme.maxAutoAuthorizeCents,
      stepUpThresholdCents: sme.stepUpThresholdCents
    });

    this.broadcast("SME_SPAWNED", { sme, token });

    if (sku && pledgedUnits) {
      this.joinCoalition({ smeId, sku, units: pledgedUnits });
    }

    return { sme, token };
  }

  createCustomClan({
    clanId,
    clanName,
    founderSmeId,
    sku,
    skuName,
    targetUnits,
    basePriceUsd,
    tiers,
    constitution,
    founderVetoRules,
    metaGovernancePolicy,
    dataSources
  }) {
    const repaymentStorage = getRepaymentStorage();
    const outstandingDebt = repaymentStorage.getOutstandingDebtTotalCents(founderSmeId);
    if (outstandingDebt > 0) {
      throw new GovernanceError(
        "OUTSTANDING_DEBT_BLOCK",
        `Founder ${founderSmeId} has outstanding debts of $${(outstandingDebt / 100).toFixed(2)}. Unsettled liabilities must be resolved via PayPal before creating new clans.`
      );
    }

    if (!clanId) {
      const existing = [...this.coalitions.values()].find(
        c => c.skuName === (skuName || clanName || sku)
      );
      if (existing) {
        let constitution = null;
        try { constitution = getClanGovernanceAdapter().getConstitution(existing.id); } catch { constitution = null; }
        return { coalition: existing, constitution, existing: true };
      }
    }

    const newClanId = clanId || `clan_${(sku || "custom").replace(/[^a-zA-Z0-9]/g, "_")}_${Date.now()}`;
    const baseCents = basePriceUsd ? Math.round(basePriceUsd * 100) : 1000;
    const moqTarget = targetUnits || tiers?.[1]?.minUnits || 500;

    const mergedRules = {
      ...DEFAULT_CLAN_RULES,
      ...(constitution || {})
    };

    const charter = {
      clanId: newClanId,
      clanName: clanName || `Syndicate for ${skuName || sku}`,
      founderSmeId,
      sku: sku || "custom-commodity",
      skuName: skuName || clanName || sku,
      targetUnits: moqTarget,
      basePriceCents: baseCents,
      tiers: tiers || [
        { tier: 1, minUnits: 100, priceCents: baseCents, discountPct: 0 },
        { tier: 2, minUnits: moqTarget, priceCents: Math.round(baseCents * 0.72), discountPct: 28 }
      ],
      constitution: mergedRules,
      founderVetoRules: founderVetoRules || ["MIN_DISCOUNT_PERCENT"],
      metaGovernancePolicy: metaGovernancePolicy || {
        defaultQuorum: 0.5,
        supermajorityThreshold: 0.66,
        procedureForUnforeseenIssues: "DEMOCRATIC_SUPERMAJORITY",
        unforeseenVotingDurationHours: 24
      },
      dataSources: dataSources || [],
      createdAt: new Date().toISOString()
    };

    const governanceAdapter = getClanGovernanceAdapter();
    const enactedConstitution = governanceAdapter.createCustomCharter(charter);

    const coalition = {
      id: newClanId,
      clanName: charter.clanName,
      founderSmeId,
      sku: charter.sku,
      skuName: charter.skuName,
      targetUnits: charter.targetUnits,
      currentUnits: 0,
      unitPriceCents: charter.basePriceCents,
      discountTierPct: 0,
      tiers: charter.tiers,
      status: "FORMING",
      members: [],
      constitution: enactedConstitution.rules,
      founderVetoRules: charter.founderVetoRules,
      metaGovernancePolicy: charter.metaGovernancePolicy,
      dataSources: charter.dataSources,
      createdAt: charter.createdAt,
      updatedAt: charter.createdAt
    };

    this.coalitions.set(newClanId, coalition);

    if (!this.catalog.has(charter.sku)) {
      this.catalog.set(charter.sku, {
        sku: charter.sku,
        name: charter.skuName,
        basePriceUsd: baseCents / 100,
        tiers: charter.tiers.map(t => ({
          tier: t.tier,
          minUnits: t.minUnits,
          priceUsd: t.priceCents / 100,
          discountPct: t.discountPct
        }))
      });
    }

    this.broadcast("CLAN_CREATED", { coalition, constitution: enactedConstitution });
    return { coalition, constitution: enactedConstitution };
  }

  evaluateMemberExit({ coalitionId, smeId }) {
    const coalition = this.coalitions.get(coalitionId);
    if (!coalition) {
      throw new Error(`Coalition '${coalitionId}' not found.`);
    }

    const member = coalition.members.find(m => m.smeId === smeId);
    if (!member) {
      throw new Error(`Member '${smeId}' is not part of coalition '${coalitionId}'.`);
    }

    const repaymentStorage = getRepaymentStorage();
    const debtCents = repaymentStorage.getOutstandingDebtTotalCents(smeId);
    const isForming = coalition.status === "FORMING";
    const lockedCents = isForming ? 0 : (member.authorizedCents || 0);

    return {
      smeId,
      coalitionId,
      canExitImmediately: isForming,
      exitStatus: isForming ? "EXITED_CLEAN" : "EXIT_QUEUED_POST_SETTLEMENT",
      lockedEscrowCents: lockedCents,
      unsettledDebtCents: debtCents,
      message: isForming
        ? "Member can exit cleanly. No escrow soft holds are active."
        : "Coalition is locked in fulfillment. Escrow soft hold must remain locked until supplier batch completes."
    };
  }

  leaveCoalition({ coalitionId, smeId, reason }) {
    const coalition = this.coalitions.get(coalitionId);
    if (!coalition) {
      throw new Error(`Coalition '${coalitionId}' not found.`);
    }

    const memberIndex = coalition.members.findIndex(m => m.smeId === smeId);
    if (memberIndex === -1) {
      throw new Error(`Member '${smeId}' is not part of coalition '${coalitionId}'.`);
    }

    const member = coalition.members[memberIndex];
    const repaymentStorage = getRepaymentStorage();
    const debtCents = repaymentStorage.getOutstandingDebtTotalCents(smeId);

    if (coalition.status === "FORMING") {
      coalition.members.splice(memberIndex, 1);
      coalition.currentUnits = coalition.members.reduce((sum, m) => sum + m.pledgedUnits, 0);

      this.broadcast("MEMBER_LEFT_CLAN", {
        coalitionId,
        smeId,
        remainingUnits: coalition.currentUnits,
        unsettledDebtCents: debtCents,
        reason: reason || "Voluntary withdrawal prior to escrow lock."
      });

      return {
        status: "EXITED_CLEAN",
        coalitionId,
        smeId,
        memberRemoved: true,
        remainingUnits: coalition.currentUnits,
        unsettledDebtCents: debtCents,
        message: "Successfully withdrawn from clan. Note: any historical PayPal debt liabilities remain bound to your business."
      };
    }

    member.status = "EXIT_QUEUED_POST_SETTLEMENT";
    coalition.updatedAt = new Date().toISOString();

    this.broadcast("MEMBER_EXIT_QUEUED", {
      coalitionId,
      smeId,
      lockedEscrowCents: member.authorizedCents,
      unsettledDebtCents: debtCents,
      reason: reason || "Withdrawal requested during batch fulfillment."
    });

    return {
      status: "EXIT_QUEUED_POST_SETTLEMENT",
      coalitionId,
      smeId,
      memberRemoved: false,
      lockedEscrowCents: member.authorizedCents,
      unsettledDebtCents: debtCents,
      message: "Exit recorded. Soft authorization hold remains locked to protect co-purchaser MOQ batch fulfillment. Payouts or refunds will settle per policy."
    };
  }

  async joinCoalition(arg1, arg2, arg3) {
    let smeId, sku, units, coalitionId;
    if (typeof arg1 === "object" && arg1 !== null) {
      ({ smeId, sku, units, coalitionId } = arg1);
    } else if (typeof arg1 === "string" && typeof arg2 === "string") {
      if (this.coalitions.has(arg1)) {
        coalitionId = arg1;
        smeId = arg2;
        units = arg3;
      } else {
        smeId = arg1;
        sku = arg2;
        units = arg3;
      }
    }
    const lockKey = coalitionId || sku || smeId || "coalition_lock";
    return await this.withLock(lockKey, async () => {
      const repaymentStorage = getRepaymentStorage();
      const outstandingDebt = repaymentStorage.getOutstandingDebtTotalCents(smeId);
      if (outstandingDebt > 0) {
        throw new GovernanceError(
          "OUTSTANDING_DEBT_BLOCK",
          `SME ${smeId} has outstanding debts of $${(outstandingDebt / 100).toFixed(2)}. Unsettled liabilities must be resolved via PayPal invoice before joining new clans.`
        );
      }

      let sme = this.smes.get(smeId);
      if (!sme) {
        sme = {
          id: smeId,
          name: smeId,
          maxAutoAuthorizeCents: 1000000,
          stepUpThresholdCents: 100000,
          status: "VERIFIED_KYB",
          registeredAt: new Date().toISOString()
        };
        this.smes.set(smeId, sme);
      }

      let coalition = coalitionId
        ? this.coalitions.get(coalitionId)
        : Array.from(this.coalitions.values()).find(
            c => c.sku === sku && ["FORMING", "THRESHOLD_MET"].includes(c.status)
          );

      if (!coalition) {
        const catalogItem = this.catalog.get(sku);
        const newId = coalitionId || `coalition_${sku.replace(/[^a-zA-Z0-9]/g, "_")}_${Date.now()}`;
        coalition = {
          id: newId,
          sku,
          skuName: catalogItem?.name || sku,
          targetUnits: catalogItem?.tiers?.[1]?.minUnits || 500,
          currentUnits: 0,
          unitPriceCents: (catalogItem?.basePriceUsd || 10) * 100,
          discountTierPct: 0,
          status: "FORMING",
          members: [],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };
        this.coalitions.set(newId, coalition);
      }

      const existingMember = coalition.members.find(m => m.smeId === smeId);
      if (existingMember) {
        existingMember.pledgedUnits += units;
        existingMember.authorizedCents = existingMember.pledgedUnits * coalition.unitPriceCents;
      } else {
        coalition.members.push({
          smeId,
          name: sme.name,
          pledgedUnits: units,
          authorizedCents: units * coalition.unitPriceCents,
          status: "PLEDGED",
          stepUpRequired: (units * coalition.unitPriceCents) > sme.stepUpThresholdCents,
          paypalOrderId: null,
          invoiceQrUrl: null
        });
      }

      coalition.currentUnits = coalition.members.reduce((sum, m) => sum + m.pledgedUnits, 0);

      if (coalition.currentUnits >= coalition.targetUnits && coalition.status === "FORMING") {
        const transition = transitionCoalitionState(coalition, "THRESHOLD_MET", {
          currentUnits: coalition.currentUnits,
          targetUnits: coalition.targetUnits
        });
        coalition = transition.coalition;
        this.broadcast("COALITION_THRESHOLD_MET", { coalitionId: coalition.id, units: coalition.currentUnits });
      }

      this.coalitions.set(coalition.id, coalition);
      this.broadcast("COALITION_UPDATED", { coalition });

      return coalition;
    });
  }

  async runNegotiation(coalitionId) {
    const coalition = this.coalitions.get(coalitionId);
    if (!coalition) {
      throw new Error(`Coalition ${coalitionId} not found.`);
    }

    const catalogItem = this.catalog.get(coalition.sku);
    const catalogPriceCents = (catalogItem?.basePriceUsd || 10) * 100;
    const discountTiers = catalogItem?.tiers?.map(t => ({
      minUnits: t.minUnits,
      discountPct: t.discountPct
    })) || [
      { minUnits: 100, discountPct: 0 },
      { minUnits: 500, discountPct: 28 },
      { minUnits: 1000, discountPct: 42 }
    ];

    const buyers = coalition.members.map(m => {
      const sme = this.smes.get(m.smeId);
      return {
        buyerId: m.smeId,
        requestedUnits: m.pledgedUnits,
        maxSpendCents: sme?.maxAutoAuthorizeCents || 1000000,
        stepUpThresholdCents: sme?.stepUpThresholdCents || 100000
      };
    });

    this.broadcast("NEGOTIATION_STARTED", {
      coalitionId,
      sku: coalition.sku,
      totalUnits: coalition.currentUnits,
      buyersCount: buyers.length
    });

    const negotiationResult = await proposeCoalitionAllocation(
      coalitionId,
      coalition.sku,
      buyers,
      discountTiers,
      catalogPriceCents
    );

    const { proposal, evaluation, executionSource } = negotiationResult;

    if (!evaluation.valid) {
      throw new Error(`Negotiation failed policy validation: ${evaluation.violations.join(", ")}`);
    }

    coalition.unitPriceCents = proposal.unitPriceCents;
    coalition.discountTierPct = proposal.discountPct;

    let hasStepUp = false;
    for (const alloc of proposal.allocations) {
      const member = coalition.members.find(m => m.smeId === alloc.buyerId);
      if (member) {
        member.authorizedCents = alloc.amountCents;
        member.stepUpRequired = alloc.stepUpRequired;
        if (alloc.stepUpRequired) {
          hasStepUp = true;
          try {
            const invoice = await generateInvoiceWithQr({
              recipientEmail: member.contactEmail || "buyer@example.com",
              totalCents: alloc.amountCents,
              memo: `Wholeshare Step-Up Invoice for Coalition ${coalitionId}`
            });
            member.invoiceId = invoice.invoiceId;
            member.invoiceQrUrl = invoice.qrCodeUrl;
            member.payerViewUrl = invoice.payerViewUrl;
          } catch (invErr) {
            console.error(`Step-up invoice generation error: ${invErr.message}`);
          }
        }
      }
    }

    if (hasStepUp && coalition.status !== "AWAITING_STEP_UP") {
      const transition = transitionCoalitionState(coalition, "AWAITING_STEP_UP", {
        unitPriceCents: proposal.unitPriceCents,
        discountPct: proposal.discountPct
      });
      coalition.status = transition.coalition.status;
    }

    this.coalitions.set(coalition.id, coalition);

    this.broadcast("NEGOTIATION_COMPLETED", {
      coalitionId,
      proposal,
      evaluation,
      executionSource
    });

    return { coalition, proposal, evaluation, executionSource };
  }

  authorizeEscrow(coalitionId, authorizations = {}) {
    let coalition = this.coalitions.get(coalitionId);
    if (!coalition) {
      throw new Error(`Coalition ${coalitionId} not found.`);
    }

    for (const member of coalition.members) {
      if (authorizations[member.smeId]) {
        member.paypalOrderId = authorizations[member.smeId];
      }
      if (!member.paypalOrderId) {
        throw new Error(
          `Cannot authorize escrow for member '${member.smeId}' in coalition '${coalitionId}' without valid PayPal order authorization.`
        );
      }
      member.status = "AUTHORIZED";
    }

    if (coalition.status === "FORMING") {
      const step1 = transitionCoalitionState(coalition, "THRESHOLD_MET", {
        reason: "Escrow authorization initiated."
      });
      coalition = step1.coalition;
    }

    if (coalition.status === "THRESHOLD_MET" || coalition.status === "AWAITING_STEP_UP") {
      const step2 = transitionCoalitionState(coalition, "LOCKED", {
        totalEscrowCents: coalition.members.reduce((sum, m) => sum + m.authorizedCents, 0)
      });
      coalition = step2.coalition;
    }

    this.coalitions.set(coalition.id, coalition);

    this.broadcast("ESCROW_LOCKED", {
      coalitionId,
      totalEscrowCents: coalition.members.reduce((sum, m) => sum + m.authorizedCents, 0),
      members: coalition.members
    });

    return coalition;
  }

  getLedgerState() {
    const rows = [];
    const seenIds = new Set();
    const seenSku = new Set();
    for (const c of this.coalitions.values()) {
      const skuKey = c.skuName;
      if (seenIds.has(c.id) || seenSku.has(skuKey)) continue;
      seenIds.add(c.id);
      seenSku.add(skuKey);
      const totalEscrowCents = c.members.reduce((sum, m) => sum + (m.authorizedCents || 0), 0);
      rows.push({
        coalitionId: c.id,
        id: c.id,
        sku: c.sku,
        skuName: c.skuName,
        targetUnits: c.targetUnits,
        currentUnits: c.currentUnits,
        unitPriceCents: c.unitPriceCents,
        unitPriceUsd: (c.unitPriceCents / 100).toFixed(2),
        totalEscrowCents,
        totalEscrowUsd: (totalEscrowCents / 100).toFixed(2),
        discountTierPct: c.discountTierPct,
        status: c.status,
        membersCount: c.members.length,
        members: c.members.map(m => ({
          id: `${c.id}-${m.smeId}`,
          coalitionId: c.id,
          smeId: m.smeId,
          memberId: m.smeId,
          name: m.name,
          pledgedUnits: m.pledgedUnits,
          authorizedCents: m.authorizedCents,
          authorizedUsd: (m.authorizedCents / 100).toFixed(2),
          status: m.status,
          stepUpRequired: m.stepUpRequired,
          paypalOrderId: m.paypalOrderId,
          invoiceQrUrl: m.invoiceQrUrl
        }))
      });
    }
    return rows;
  }
  updateClanSubscription(clanId, config = {}) {
    const clan = this.coalitions.get(clanId);
    if (!clan) {
      throw new Error(`Clan ID '${clanId}' not found.`);
    }

    clan.subscription = {
      monthlyDuesUsd: Number(config.monthlyDuesUsd) || 49,
      yearlyDuesUsd: Number(config.yearlyDuesUsd) || 499,
      commitmentTerm: config.commitmentTerm || "1_YEAR",
      cancellationNoticeDays: Number(config.cancellationNoticeDays) || 30,
      updatedAt: new Date().toISOString()
    };

    this.broadcast("CLAN_SUBSCRIPTION_UPDATED", {
      clanId,
      subscription: clan.subscription
    });

    return clan.subscription;
  }

  async confirmShipmentReceipt(orderId, { photoBase64, conditionStatus, notes, buyerId, coalitionId }) {
    let targetCoalition = null;
    let targetMember = null;

    // A named group wins, so a buyer in several groups confirms the right one.
    const candidates = coalitionId ? [this.coalitions.get(coalitionId)].filter(Boolean) : Array.from(this.coalitions.values());
    if (coalitionId && candidates.length === 0) {
      throw new Error(`Group '${coalitionId}' was not found.`);
    }
    for (const c of candidates) {
      const found = c.members.find(m => (orderId && m.paypalOrderId === orderId) || m.smeId === buyerId);
      if (found) {
        targetCoalition = c;
        targetMember = found;
        break;
      }
    }
    if (coalitionId && !targetMember) {
      throw new Error("You are not a member of that group.");
    }

    const timestamp = new Date().toISOString();
    const photoId = `proof_${Date.now()}`;

    if (conditionStatus === "GOOD_CONDITION") {
      if (targetCoalition) {
        targetCoalition.status = "DELIVERED";
        targetCoalition.deliveredAt = timestamp;
      }
      if (targetMember) {
        targetMember.status = "DELIVERED_CONFIRMED";
      }

      this.broadcast("SHIPMENT_DELIVERY_CONFIRMED", {
        orderId,
        buyerId,
        coalitionId: targetCoalition?.id,
        status: "DELIVERED",
        conditionStatus: "GOOD_CONDITION",
        photoProofId: photoId,
        notes,
        timestamp
      });

      return {
        status: "DELIVERY_CONFIRMED",
        conditionStatus: "GOOD_CONDITION",
        orderId,
        coalitionStatus: targetCoalition?.status,
        inspectionClockHours: 48,
        message: "Delivery receipt confirmed in good condition. 48-hour inspection dispute clock running before batch capture."
      };
    } else {
      if (targetCoalition) {
        targetCoalition.status = "DISPUTED";
      }
      if (targetMember) {
        targetMember.status = "DISPUTE_FILED";
      }

      const claimId = `claim_${Date.now()}`;
      try {
        const { getClaimsStorage } = await import("../storage/claims.storage.ts");
        const claimsStorage = getClaimsStorage();
        claimsStorage.save({
          id: claimId,
          orderId: orderId || "ORD_UNKNOWN",
          coalitionId: targetCoalition?.id || "coalition_flour_01",
          buyerId: buyerId || "sme_austin_01",
          totalAmount: (targetMember?.authorizedCents || 150000) / 100,
          claimedRefundAmount: Math.round(((targetMember?.authorizedCents || 150000) / 100) * 0.4),
          status: "DRAFT",
          evidence: {
            photoUrls: [photoId],
            description: notes || "Multimodal damage proof uploaded by buyer."
          },
          createdAt: timestamp,
          updatedAt: timestamp
        });
      } catch (err) {
        console.error("Failed to persist damage claim:", err.message);
      }

      this.broadcast("ESCROW_DISPUTED", {
        claimId,
        orderId,
        buyerId,
        coalitionId: targetCoalition?.id,
        status: "DISPUTED_FROZEN",
        conditionStatus: "DAMAGED_OR_OUT_OF_SPEC",
        notes,
        timestamp
      });

      return {
        status: "DISPUTE_REGISTERED",
        conditionStatus: "DAMAGED_OR_OUT_OF_SPEC",
        claimId,
        orderId,
        frozenHoldCents: targetMember?.authorizedCents,
        message: "Shipment marked damaged or out of spec. Remaining escrow hold frozen. 48-hour damage ticket intaken for pro-rata dispute triage."
      };
    }
  }

  getMatchmakingSnapshot(filters = {}) {
    const clans = Array.from(this.coalitions.values()).map(c => {
      const catalogItem = this.catalog.get(c.sku);
      const totalEscrowCents = c.members.reduce((sum, m) => sum + (m.authorizedCents || 0), 0);
      const retailPriceUsd = catalogItem?.basePriceUsd || 10;
      const wholesalePriceUsd = c.unitPriceCents / 100;
      const savingsPct = retailPriceUsd > 0 ? Math.round(((retailPriceUsd - wholesalePriceUsd) / retailPriceUsd) * 100) : 0;
      return {
        id: c.id,
        name: c.skuName,
        sku: c.sku,
        category: catalogItem?.category || "WHOLESALE_COMMODITY",
        status: c.status,
        currentUnits: c.currentUnits,
        targetUnits: c.targetUnits,
        progressPct: c.targetUnits > 0 ? Math.min(100, Math.round((c.currentUnits / c.targetUnits) * 100)) : 0,
        retailPriceUsd,
        wholesalePriceUsd,
        savingsPct,
        totalEscrowUsd: (totalEscrowCents / 100).toFixed(2),
        membersCount: c.members.length,
        subscription: c.subscription || {
          monthlyDuesUsd: 49,
          yearlyDuesUsd: 499,
          commitmentTerm: "1_YEAR",
          cancellationNoticeDays: 30
        },
        tradeCorridor: {
          origin: c.originPort || "US Central Depot",
          destination: c.destinationPort || "Regional Hub",
          transitDays: 14
        }
      };
    });

    return {
      exportedAt: new Date().toISOString(),
      source: "WholeShare B2B Autonomous Matchmaking Engine",
      totalClans: clans.length,
      activeEscrowVolumeUsd: clans.reduce((sum, c) => sum + parseFloat(c.totalEscrowUsd), 0).toFixed(2),
      clans
    };
  }
}

export const actionDispatcher = new WholeshareActionDispatcher();
