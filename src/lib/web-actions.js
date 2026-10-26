import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import crypto from "node:crypto";
import { createSharedPaymentToken } from "./token.js";
import { interceptNegotiationProposal } from "./interceptor.js";
import { proposeCoalitionAllocation } from "./model-runner.js";
import { transitionCoalitionState } from "./fsm.js";

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
    this.resetState();
  }

  resetState() {
    this.smes.clear();
    this.coalitions.clear();
    this.catalog.clear();
    this.eventLog = [];

    for (const item of initialCatalog) {
      this.catalog.set(item.sku, item);
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

  joinCoalition({ smeId, sku, units }) {
    const sme = this.smes.get(smeId);
    if (!sme) {
      throw new Error(`SME ${smeId} not found.`);
    }

    let coalition = Array.from(this.coalitions.values()).find(
      c => c.sku === sku && ["FORMING", "THRESHOLD_MET"].includes(c.status)
    );

    if (!coalition) {
      const catalogItem = this.catalog.get(sku);
      const newId = `coalition_${sku.replace(/[^a-zA-Z0-9]/g, "_")}_${Date.now()}`;
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
          member.invoiceQrUrl = `https://sandbox.paypal.com/invoice/qr/INV2-${Math.random().toString(36).substring(2, 8).toUpperCase()}.png`;
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

  authorizeEscrow(coalitionId) {
    let coalition = this.coalitions.get(coalitionId);
    if (!coalition) {
      throw new Error(`Coalition ${coalitionId} not found.`);
    }

    for (const member of coalition.members) {
      member.status = "AUTHORIZED";
      member.paypalOrderId = `ORD-SANDBOX-AUTH-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
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
    for (const c of this.coalitions.values()) {
      const totalEscrowCents = c.members.reduce((sum, m) => sum + (m.authorizedCents || 0), 0);
      rows.push({
        coalitionId: c.id,
        sku: c.sku,
        skuName: c.skuName,
        targetUnits: c.targetUnits,
        currentUnits: c.currentUnits,
        unitPriceUsd: (c.unitPriceCents / 100).toFixed(2),
        totalEscrowUsd: (totalEscrowCents / 100).toFixed(2),
        discountTierPct: c.discountTierPct,
        status: c.status,
        membersCount: c.members.length,
        members: c.members.map(m => ({
          smeId: m.smeId,
          name: m.name,
          pledgedUnits: m.pledgedUnits,
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
}

export const actionDispatcher = new WholeshareActionDispatcher();
