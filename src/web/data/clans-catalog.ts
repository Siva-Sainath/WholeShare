export interface ClanLeader {
  name: string;
  title: string;
  company: string;
  avatarText: string;
  avatarBg: string;
  trustScore: number;
  yearsActive: number;
  historicalSettledUsd: string;
}

export interface ClanTrackRecord {
  lifetimeClansSettled: number;
  defaultRate: string;
  inspectionPassRate: string;
  foundedYear: number;
}

export interface DiscountTier {
  minUnits: number;
  discountPct: number;
}

export interface ClanItem {
  id: string;
  name: string;
  category: string;
  vertical: string;
  commodity: string;
  sku: string;
  city: string;
  country: string;
  currency: string;
  targetUnits: number;
  currentUnits: number;
  baseUnitPrice: string;
  discountTiers: DiscountTier[];
  supplierName: string;
  supplierTrustScore: number;
  memberCount: number;
  maxMembers: number;
  status: "FORMING" | "LOCKED" | "SETTLED";
  tags: string[];
  leader: ClanLeader;
  trackRecord: ClanTrackRecord;
}

export const SYNTHETIC_CLANS: ClanItem[] = [
  {
    id: "clan-austin-organic-stone-ground-003",
    name: "Austin Organic Stone-Ground Hard Purchasing Syndicate",
    category: "Grain & Bakery",
    vertical: "PROCESS_BATCH_PRODUCTION",
    commodity: "Organic Stone-Ground Hard Red Winter Wheat Flour (50lb)",
    sku: "Organic Stone-Ground Hard Red Winter Wheat Flour",
    city: "Austin",
    country: "US",
    currency: "USD",
    targetUnits: 5000,
    currentUnits: 4450,
    baseUnitPrice: "$1.20 / lb",
    discountTiers: [
      { minUnits: 1000, discountPct: 10 },
      { minUnits: 2500, discountPct: 18 },
      { minUnits: 5000, discountPct: 28 }
    ],
    supplierName: "Heartland Heritage Grain Millers Co-op",
    supplierTrustScore: 0.978,
    memberCount: 5,
    maxMembers: 6,
    status: "FORMING",
    tags: ["USDA Organic", "Heartland Co-op", "Tier-1 Milling", "Moisture Tested"],
    leader: {
      name: "Arthur Pendelton",
      title: "Master Baker & Co-op Lead",
      company: "Austin Artisan Bakery",
      avatarText: "AP",
      avatarBg: "#10b981",
      trustScore: 99.4,
      yearsActive: 4.2,
      historicalSettledUsd: "$312,400"
    },
    trackRecord: {
      lifetimeClansSettled: 14,
      defaultRate: "0.00%",
      inspectionPassRate: "100.0%",
      foundedYear: 2022
    }
  },
  {
    id: "clan-austin-specialty-grade-002",
    name: "Austin Specialty Grade 1 Coffee Purchasing Syndicate",
    category: "Coffee & Beverage",
    vertical: "PROCESS_BATCH_PRODUCTION",
    commodity: "Ethiopian Yirgacheffe Grade 1 Green Coffee (60kg Sack)",
    sku: "Specialty Grade 1 Ethiopian Yirgacheffe Green Coffee Beans",
    city: "Austin",
    country: "US",
    currency: "USD",
    targetUnits: 2000,
    currentUnits: 1520,
    baseUnitPrice: "$9.50 / kg",
    discountTiers: [
      { minUnits: 500, discountPct: 12 },
      { minUnits: 1000, discountPct: 22 },
      { minUnits: 2000, discountPct: 32 }
    ],
    supplierName: "Oromia Specialty Coffee Export Syndicate",
    supplierTrustScore: 0.985,
    memberCount: 4,
    maxMembers: 5,
    status: "FORMING",
    tags: ["SCA Score 88+", "Direct Trade", "Climate Monitored", "Ocean Freight"],
    leader: {
      name: "Marcus Vance",
      title: "Head of Green Coffee Sourcing",
      company: "Pacific Northwest Micro-Roasters Guild",
      avatarText: "MV",
      avatarBg: "#f59e0b",
      trustScore: 98.8,
      yearsActive: 3.5,
      historicalSettledUsd: "$412,000"
    },
    trackRecord: {
      lifetimeClansSettled: 9,
      defaultRate: "0.00%",
      inspectionPassRate: "99.4%",
      foundedYear: 2023
    }
  },
  {
    id: "clan-austin-artisan-sicilian-001",
    name: "Austin Artisan Sicilian Pistachio Purchasing Syndicate",
    category: "Food & Grain",
    vertical: "PROCESS_BATCH_PRODUCTION",
    commodity: "Artisan Sicilian Bronte Pistachio Paste 100% Pure (5kg Tub)",
    sku: "Artisan Sicilian Pistachio Paste 100% Pure",
    city: "Austin",
    country: "US",
    currency: "USD",
    targetUnits: 1000,
    currentUnits: 630,
    baseUnitPrice: "$45.00 / kg",
    discountTiers: [
      { minUnits: 250, discountPct: 15 },
      { minUnits: 500, discountPct: 25 },
      { minUnits: 1000, discountPct: 35 }
    ],
    supplierName: "Bronte Pistacchio Consorzio D.O.P.",
    supplierTrustScore: 0.992,
    memberCount: 3,
    maxMembers: 4,
    status: "FORMING",
    tags: ["D.O.P. Certified", "Italian Import", "Cold-Chain Air", "Zero Fillers"],
    leader: {
      name: "Elena Rossi",
      title: "Executive Pastry Chef",
      company: "Dolce Farina Pastries",
      avatarText: "ER",
      avatarBg: "#ec4899",
      trustScore: 99.2,
      yearsActive: 2.8,
      historicalSettledUsd: "$184,500"
    },
    trackRecord: {
      lifetimeClansSettled: 7,
      defaultRate: "0.00%",
      inspectionPassRate: "100.0%",
      foundedYear: 2023
    }
  },
  {
    id: "clan-austin-solid-carbide-006",
    name: "Austin Solid Carbide 4-Flute Purchasing Syndicate",
    category: "Precision Tooling",
    vertical: "DISCRETE_MANUFACTURING",
    commodity: "Solid Carbide 4-Flute TiAlN Coated End Mill Set 1/2in",
    sku: "Solid Carbide 4-Flute TiAlN Coated End Mill Set 1/2in",
    city: "Austin",
    country: "US",
    currency: "USD",
    targetUnits: 300,
    currentUnits: 255,
    baseUnitPrice: "$68.00 / unit",
    discountTiers: [
      { minUnits: 50, discountPct: 15 },
      { minUnits: 150, discountPct: 24 },
      { minUnits: 300, discountPct: 35 }
    ],
    supplierName: "Guhring Precision Tools Werkzeuge",
    supplierTrustScore: 0.995,
    memberCount: 5,
    maxMembers: 8,
    status: "FORMING",
    tags: ["DIN ISO 9001", "Sub-Micron Grain", "TiAlN Multi-layer", "Factory Direct"],
    leader: {
      name: "Vikram Sethi",
      title: "Director of Advanced Machining",
      company: "Apex Precision CNC Components",
      avatarText: "VS",
      avatarBg: "#3b82f6",
      trustScore: 99.6,
      yearsActive: 5.1,
      historicalSettledUsd: "$520,000"
    },
    trackRecord: {
      lifetimeClansSettled: 18,
      defaultRate: "0.00%",
      inspectionPassRate: "99.9%",
      foundedYear: 2021
    }
  },
  {
    id: "clan-austin-aerospace-grade-007",
    name: "Austin Aerospace Grade 5 Titanium Syndicate",
    category: "Precision Fasteners",
    vertical: "DISCRETE_MANUFACTURING",
    commodity: "Aerospace Grade 5 Titanium Fastener Bolts DIN 933 M8",
    sku: "Aerospace Grade 5 Titanium Fastener Bolts DIN 933 M8",
    city: "Austin",
    country: "US",
    currency: "USD",
    targetUnits: 2000,
    currentUnits: 1100,
    baseUnitPrice: "$14.50 / bolt",
    discountTiers: [
      { minUnits: 400, discountPct: 12 },
      { minUnits: 1000, discountPct: 22 },
      { minUnits: 2000, discountPct: 32 }
    ],
    supplierName: "Kobe Steel Precision Fastener Division",
    supplierTrustScore: 0.996,
    memberCount: 3,
    maxMembers: 6,
    status: "FORMING",
    tags: ["AS9100D Certified", "Full Traceability", "Ultrasonic Inspected"],
    leader: {
      name: "Hannah Lindqvist",
      title: "Procurement Architect",
      company: "Shenzhen Precision SMT Builders",
      avatarText: "HL",
      avatarBg: "#8b5cf6",
      trustScore: 99.8,
      yearsActive: 4.8,
      historicalSettledUsd: "$740,000"
    },
    trackRecord: {
      lifetimeClansSettled: 22,
      defaultRate: "0.00%",
      inspectionPassRate: "100.0%",
      foundedYear: 2021
    }
  },
  {
    id: "clan-austin-recycled-corrugated-010",
    name: "Austin Recycled Corrugated Shipping Packaging Syndicate",
    category: "Packaging & Logistics",
    vertical: "PACKAGING_MATERIALS",
    commodity: "Recycled Corrugated Shipping Box 200lb Test 16x12x12 (Bundle 25)",
    sku: "Recycled Corrugated Shipping Box 200lb Test 16x12x12",
    city: "Austin",
    country: "US",
    currency: "USD",
    targetUnits: 8000,
    currentUnits: 4080,
    baseUnitPrice: "$1.15 / box",
    discountTiers: [
      { minUnits: 1500, discountPct: 14 },
      { minUnits: 4000, discountPct: 22 },
      { minUnits: 8000, discountPct: 34 }
    ],
    supplierName: "Smurfit Westrock Packaging Group",
    supplierTrustScore: 0.989,
    memberCount: 3,
    maxMembers: 5,
    status: "FORMING",
    tags: ["FSC Certified", "100% Post-Consumer", "Heavy-Duty ECT-32", "Flat-Packed"],
    leader: {
      name: "Carlos Mendoza",
      title: "Supply Chain Operations Lead",
      company: "Lone Star Packaging Syndicate",
      avatarText: "CM",
      avatarBg: "#06b6d4",
      trustScore: 98.4,
      yearsActive: 3.2,
      historicalSettledUsd: "$298,000"
    },
    trackRecord: {
      lifetimeClansSettled: 11,
      defaultRate: "0.00%",
      inspectionPassRate: "99.7%",
      foundedYear: 2023
    }
  },
  {
    id: "clan-austin-cold-pressed-extra-004",
    name: "Austin Cold-Pressed Extra Virgin Olive Oil Syndicate",
    category: "Food & Grain",
    vertical: "PROCESS_BATCH_PRODUCTION",
    commodity: "Cold-Pressed Extra Virgin Spanish Arbequina Olive Oil (5L Drum)",
    sku: "Cold-Pressed Extra Virgin Spanish Arbequina Olive Oil",
    city: "Austin",
    country: "US",
    currency: "USD",
    targetUnits: 1500,
    currentUnits: 885,
    baseUnitPrice: "$12.50 / L",
    discountTiers: [
      { minUnits: 300, discountPct: 12 },
      { minUnits: 750, discountPct: 20 },
      { minUnits: 1500, discountPct: 30 }
    ],
    supplierName: "OleoAndaluz Export Cooperativa",
    supplierTrustScore: 0.988,
    memberCount: 3,
    maxMembers: 5,
    status: "FORMING",
    tags: ["Cold-Pressed", "Estate Grown", "Acidity < 0.2%", "Nitrogen Flushed"],
    leader: {
      name: "Sofia Navarro",
      title: "Cooperative Buyer",
      company: "Texas Culinary Collective",
      avatarText: "SN",
      avatarBg: "#14b8a6",
      trustScore: 99.1,
      yearsActive: 2.5,
      historicalSettledUsd: "$165,000"
    },
    trackRecord: {
      lifetimeClansSettled: 6,
      defaultRate: "0.00%",
      inspectionPassRate: "100.0%",
      foundedYear: 2024
    }
  },
  {
    id: "clan-kyoto-green-coffee-012",
    name: "Kyoto Specialty Green Coffee Syndicate",
    category: "Coffee & Beverage",
    vertical: "PROCESS_BATCH_PRODUCTION",
    commodity: "Kyoto Direct Import Specialty Grade 1 Green Coffee (60kg)",
    sku: "Specialty Grade 1 Green Coffee Beans",
    city: "Kyoto",
    country: "JP",
    currency: "USD",
    targetUnits: 1000,
    currentUnits: 1000,
    baseUnitPrice: "$9.50 / kg",
    discountTiers: [
      { minUnits: 250, discountPct: 10 },
      { minUnits: 500, discountPct: 20 },
      { minUnits: 1000, discountPct: 30 }
    ],
    supplierName: "Kyoto Direct Importers",
    supplierTrustScore: 0.99,
    memberCount: 3,
    maxMembers: 3,
    status: "LOCKED",
    tags: ["Kansai Hub", "Direct Sourced", "Micro-Lot", "Air Freight"],
    leader: {
      name: "Kenji Takahashi",
      title: "Kansai Roastmaster",
      company: "Kyoto Artisan Roasters",
      avatarText: "KT",
      avatarBg: "#d97706",
      trustScore: 99.5,
      yearsActive: 6.0,
      historicalSettledUsd: "$680,000"
    },
    trackRecord: {
      lifetimeClansSettled: 26,
      defaultRate: "0.00%",
      inspectionPassRate: "100.0%",
      foundedYear: 2020
    }
  }
];

