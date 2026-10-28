export const INCOTERMS_2020 = Object.freeze({
  EXW: {
    code: "EXW",
    name: "Ex Works",
    riskTransferPoint: "Seller facility gate prior to export loading",
    freightPayer: "BUYER",
    customsExportPayer: "BUYER",
    customsImportPayer: "BUYER",
    escrowReleaseTrigger: "FACTORY_GATE_PICKUP"
  },
  FCA: {
    code: "FCA",
    name: "Free Carrier",
    riskTransferPoint: "Handover to buyer designated carrier at terminal",
    freightPayer: "BUYER",
    customsExportPayer: "SELLER",
    customsImportPayer: "BUYER",
    escrowReleaseTrigger: "EXPORT_CARRIER_HANDOVER"
  },
  FOB: {
    code: "FOB",
    name: "Free on Board",
    riskTransferPoint: "Loaded on board carrier vessel at port of departure",
    freightPayer: "BUYER",
    customsExportPayer: "SELLER",
    customsImportPayer: "BUYER",
    escrowReleaseTrigger: "BILL_OF_LADING_ISSUED"
  },
  CIF: {
    code: "CIF",
    name: "Cost, Insurance and Freight",
    riskTransferPoint: "Loaded on board carrier vessel with ocean freight and marine insurance paid by seller",
    freightPayer: "SELLER",
    customsExportPayer: "SELLER",
    customsImportPayer: "BUYER",
    escrowReleaseTrigger: "DESTINATION_PORT_ARRIVAL"
  },
  CIP: {
    code: "CIP",
    name: "Carriage and Insurance Paid to",
    riskTransferPoint: "Delivery to main carrier with multimodal all-risk insurance",
    freightPayer: "SELLER",
    customsExportPayer: "SELLER",
    customsImportPayer: "BUYER",
    escrowReleaseTrigger: "CARRIER_ONWARD_RECEIPT"
  },
  DAP: {
    code: "DAP",
    name: "Delivered at Place",
    riskTransferPoint: "Arrived at buyer unloading destination ready for unloading",
    freightPayer: "SELLER",
    customsExportPayer: "SELLER",
    customsImportPayer: "BUYER",
    escrowReleaseTrigger: "DESTINATION_UNLOADING_READY"
  },
  DDP: {
    code: "DDP",
    name: "Delivered Duty Paid",
    riskTransferPoint: "Delivered to buyer facility cleared for import with all duties and taxes paid",
    freightPayer: "SELLER",
    customsExportPayer: "SELLER",
    customsImportPayer: "SELLER",
    escrowReleaseTrigger: "FINAL_FACILITY_DELIVERY"
  }
});

export const GLOBAL_LOGISTICS_CORRIDORS = Object.freeze([
  {
    id: "CORRIDOR_PEARL_RIVER_TO_LONG_BEACH",
    name: "Transpacific Pearl River Delta to West Coast Gateway",
    originRegion: "APAC",
    originHub: "Yantian / Shenzhen Port (CN)",
    destinationRegion: "NORTH_AMERICA",
    destinationHub: "Port of Los Angeles / Long Beach (US)",
    modalType: "MARITIME_FCL",
    typicalTransitDays: { min: 14, max: 21 },
    customsCheckpoints: ["CHINA_CUSTOMS_EXPORT_DECLARATION", "US_CBP_ISF_FILING", "US_CUSTOMS_ENTRY"],
    primaryCommodities: ["CONSUMER_ELECTRONICS", "PCB_SUBASSEMBLIES", "PRECISION_TOOLING"],
    primaryIncoterm: "FOB"
  },
  {
    id: "CORRIDOR_SOUTH_ASIA_TO_ROTTERDAM",
    name: "Suez Maritime South Asia Textile & Agro Corridor",
    originRegion: "SOUTH_ASIA",
    originHub: "Tuticorin / Chennai / Port of Colombo (IN/LK)",
    destinationRegion: "EMEA",
    destinationHub: "Port of Rotterdam (NL)",
    modalType: "MARITIME_FCL",
    typicalTransitDays: { min: 20, max: 28 },
    customsCheckpoints: ["INDIAN_ICEGATE_SHIPPING_BILL", "SUEZ_MARITIME_TRANSIT", "EU_ATLAS_IMPORT_DECLARATION"],
    primaryCommodities: ["COMBED_COTTON_YARN", "ORGANIC_GREY_FABRIC", "SPUN_POLYESTER"],
    primaryIncoterm: "CIF"
  },
  {
    id: "CORRIDOR_MEDELLIN_TO_HAMBURG",
    name: "Panama Transit Colombian Specialty Agro Corridor",
    originRegion: "LATAM",
    originHub: "Port of Cartagena / Buenaventura (CO)",
    destinationRegion: "EMEA",
    destinationHub: "Port of Hamburg (DE)",
    modalType: "MARITIME_FCL",
    typicalTransitDays: { min: 18, max: 25 },
    customsCheckpoints: ["DIAN_EXPORT_CERTIFICATE", "PANAMA_CANAL_TRANSIT", "EU_PHYTOSANITARY_HEALTH_CERT"],
    primaryCommodities: ["SPECIALTY_GREEN_COFFEE", "FAIR_TRADE_CACAO", "AVOCADO_PRODUCE"],
    primaryIncoterm: "FOB"
  },
  {
    id: "CORRIDOR_RHINE_ALPINE_OVERLAND",
    name: "Rhine-Alpine Central European Precision Industrial Corridor",
    originRegion: "EMEA",
    originHub: "Stuttgart / Munich Manufacturing Hub (DE)",
    destinationRegion: "EMEA",
    destinationHub: "Milan / Turin Automotive Cluster (IT)",
    modalType: "MULTIMODAL_RAIL",
    typicalTransitDays: { min: 2, max: 4 },
    customsCheckpoints: ["EU_INTRASTAT_DECLARATION", "ALPS_BASE_TUNNEL_RAIL_CLEARANCE"],
    primaryCommodities: ["PLANETARY_GEARBOXES", "HYDRAULIC_VALVES", "DIN_FASTENERS"],
    primaryIncoterm: "DAP"
  },
  {
    id: "CORRIDOR_NAIVASHA_TO_SCHIPHOL_AIR",
    name: "Equatorial Cold Chain Air Express Horticultural Corridor",
    originRegion: "AFRICA",
    originHub: "Jomo Kenyatta International Airport, Nairobi (KE)",
    destinationRegion: "EMEA",
    destinationHub: "Amsterdam Airport Schiphol (NL)",
    modalType: "AIR_EXPRESS_COLDCHAIN",
    typicalTransitDays: { min: 1, max: 2 },
    customsCheckpoints: ["KEPHIS_PHYTOSANITARY_INSPECTION", "DUTCH_NVWA_BORDER_INSPECTION"],
    primaryCommodities: ["FRESH_CUT_FLOWERS", "FRENCH_BEANS", "CHILLED_HERBS"],
    primaryIncoterm: "CIP"
  },
  {
    id: "CORRIDOR_KANSAI_TO_INCHEON_OPTICS",
    name: "East Asian Precision Robotics & Optics Express",
    originRegion: "APAC",
    originHub: "Osaka Kansai International (JP)",
    destinationRegion: "APAC",
    destinationHub: "Incheon International Airport (KR)",
    modalType: "AIR_CARGO",
    typicalTransitDays: { min: 1, max: 2 },
    customsCheckpoints: ["JAPAN_CUSTOMS_EXPORT_PERMIT", "KOREA_UNIPASS_IMPORT_ENTRY"],
    primaryCommodities: ["TELECENTRIC_LENSES", "HARMONIC_SPEED_REDUCERS", "MEMS_SENSORS"],
    primaryIncoterm: "FCA"
  }
]);

export const FIAT_EXCHANGE_RATES_BPS = Object.freeze({
  USD: 10000,
  EUR: 10850,
  GBP: 12920,
  JPY: 65,
  CAD: 7250,
  AUD: 6550,
  INR: 119,
  CNH: 1380
});

export function convertCurrencyToCents(amount, sourceCurrency, targetCurrency = "USD") {
  if (typeof amount !== "number" || !Number.isInteger(amount) || amount < 0) {
    throw new TypeError("Amount must be a non-negative integer representation of minor units.");
  }

  const srcRate = FIAT_EXCHANGE_RATES_BPS[sourceCurrency];
  const tgtRate = FIAT_EXCHANGE_RATES_BPS[targetCurrency];

  if (!srcRate) {
    throw new Error(`Unsupported source currency: ${sourceCurrency}`);
  }
  if (!tgtRate) {
    throw new Error(`Unsupported target currency: ${targetCurrency}`);
  }

  if (sourceCurrency === targetCurrency) {
    return amount;
  }

  const usdValueBps = BigInt(amount) * BigInt(srcRate);
  const targetCents = usdValueBps / BigInt(tgtRate);

  return Number(targetCents);
}

export function calculateFxRiskBuffer(amountCents, bufferBps = 200) {
  if (typeof amountCents !== "number" || !Number.isInteger(amountCents) || amountCents < 0) {
    throw new TypeError("Amount cents must be a non-negative integer.");
  }
  if (typeof bufferBps !== "number" || !Number.isInteger(bufferBps) || bufferBps < 0) {
    throw new TypeError("Buffer basis points must be a non-negative integer.");
  }

  const bufferAmount = (BigInt(amountCents) * BigInt(bufferBps)) / 10000n;
  return Number(bufferAmount);
}

export const CROSS_BORDER_ESCROW_STATES = Object.freeze([
  "DRAFT",
  "SOFT_LOCKED",
  "EXPORT_CUSTOMS_CLEARED",
  "CARRIER_ONBOARD_BL",
  "IMPORT_CUSTOMS_CLEARED",
  "DESTINATION_ACCEPTED",
  "SETTLED",
  "DISPUTED"
]);

export const VALID_CROSS_BORDER_TRANSITIONS = Object.freeze({
  DRAFT: ["SOFT_LOCKED"],
  SOFT_LOCKED: ["EXPORT_CUSTOMS_CLEARED", "DISPUTED"],
  EXPORT_CUSTOMS_CLEARED: ["CARRIER_ONBOARD_BL", "DISPUTED"],
  CARRIER_ONBOARD_BL: ["IMPORT_CUSTOMS_CLEARED", "DISPUTED"],
  IMPORT_CUSTOMS_CLEARED: ["DESTINATION_ACCEPTED", "DISPUTED"],
  DESTINATION_ACCEPTED: ["SETTLED"],
  DISPUTED: ["SETTLED"],
  SETTLED: []
});

export class CrossBorderEscrowEngine {
  constructor() {
    this.contracts = new Map();
  }

  createContract({
    contractId,
    buyerId,
    sellerId,
    amountCents,
    currency = "USD",
    incoterm = "FOB",
    corridorId,
    fxBufferBps = 200
  }) {
    if (!contractId || !buyerId || !sellerId || !corridorId) {
      throw new Error("Missing mandatory contract identifiers.");
    }
    if (typeof amountCents !== "number" || !Number.isInteger(amountCents) || amountCents <= 0) {
      throw new TypeError("amountCents must be a positive integer.");
    }
    if (!INCOTERMS_2020[incoterm]) {
      throw new Error(`Unsupported Incoterm: ${incoterm}`);
    }

    const corridor = GLOBAL_LOGISTICS_CORRIDORS.find(c => c.id === corridorId);
    if (!corridor) {
      throw new Error(`Unknown logistics corridor: ${corridorId}`);
    }

    const fxBufferCents = calculateFxRiskBuffer(amountCents, fxBufferBps);
    const totalAuthorizedCents = amountCents + fxBufferCents;

    const contract = {
      contractId,
      buyerId,
      sellerId,
      amountCents,
      currency,
      incoterm: INCOTERMS_2020[incoterm],
      corridor,
      fxBufferCents,
      totalAuthorizedCents,
      state: "DRAFT",
      history: [
        {
          from: null,
          to: "DRAFT",
          timestamp: new Date().toISOString(),
          reason: "Contract created"
        }
      ],
      carrierTracking: null,
      customsDeclarations: []
    };

    this.contracts.set(contractId, contract);
    return contract;
  }

  transitionState(contractId, nextState, metadata = {}) {
    const contract = this.contracts.get(contractId);
    if (!contract) {
      throw new Error(`Contract ${contractId} not found.`);
    }

    const validNextStates = VALID_CROSS_BORDER_TRANSITIONS[contract.state];
    if (!validNextStates || !validNextStates.includes(nextState)) {
      throw new Error(`Illegal state transition from ${contract.state} to ${nextState}.`);
    }

    contract.state = nextState;
    contract.history.push({
      from: contract.state,
      to: nextState,
      timestamp: new Date().toISOString(),
      metadata
    });

    if (metadata.trackingNumber) {
      contract.carrierTracking = {
        carrier: metadata.carrier || "CARRIER_UNSPECIFIED",
        trackingNumber: metadata.trackingNumber,
        verifiedAt: new Date().toISOString()
      };
    }

    if (metadata.customsDocId) {
      contract.customsDeclarations.push({
        docId: metadata.customsDocId,
        checkpoint: metadata.checkpoint,
        clearedAt: new Date().toISOString()
      });
    }

    return contract;
  }

  calculateSettlement(contractId) {
    const contract = this.contracts.get(contractId);
    if (!contract) {
      throw new Error(`Contract ${contractId} not found.`);
    }

    if (contract.state !== "DESTINATION_ACCEPTED" && contract.state !== "DISPUTED") {
      throw new Error(`Cannot settle contract in state ${contract.state}. Must be DESTINATION_ACCEPTED or DISPUTED.`);
    }

    const sellerPayoutCents = contract.amountCents;
    const buyerRefundBufferCents = contract.fxBufferCents;

    return {
      contractId,
      totalAuthorizedCents: contract.totalAuthorizedCents,
      sellerPayoutCents,
      buyerRefundBufferCents,
      currency: contract.currency,
      settledAt: new Date().toISOString()
    };
  }
}

export function matchLogisticsCorridor(originRegion, destinationRegion, commodityCategory) {
  return GLOBAL_LOGISTICS_CORRIDORS.find(c => {
    const matchesOrigin = !originRegion || c.originRegion === originRegion;
    const matchesDest = !destinationRegion || c.destinationRegion === destinationRegion;
    const matchesCommodity = !commodityCategory || c.primaryCommodities.some(comm => comm.includes(commodityCategory.toUpperCase()));
    return matchesOrigin && matchesDest && matchesCommodity;
  }) || GLOBAL_LOGISTICS_CORRIDORS[0];
}
