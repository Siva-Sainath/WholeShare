import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";

const MEMORY_BASE_DIR = resolve(process.cwd(), "data/memory");

function ensureDirectory(dirPath) {
  if (!existsSync(dirPath)) {
    mkdirSync(dirPath, { recursive: true });
  }
}

function readJsonFile(filePath, defaultValue = null) {
  try {
    if (!existsSync(filePath)) return defaultValue;
    const content = readFileSync(filePath, "utf-8");
    return JSON.parse(content);
  } catch {
    return defaultValue;
  }
}

function writeJsonFile(filePath, data) {
  ensureDirectory(dirname(filePath));
  writeFileSync(filePath, JSON.stringify(data, null, 2), "utf-8");
}

export class InstinctMemoryStore {
  constructor(baseDir = MEMORY_BASE_DIR) {
    this.baseDir = baseDir;
    this.smeDir = resolve(baseDir, "entities/smes");
    this.catalogDir = resolve(baseDir, "knowledge/catalog");
    this.decisionsDir = resolve(baseDir, "knowledge/decisions");
    this.initDefaultMemory();
  }

  initDefaultMemory() {
    ensureDirectory(this.smeDir);
    ensureDirectory(this.catalogDir);
    ensureDirectory(this.decisionsDir);

    const defaultSku = "organic-flour-50lb";
    const catalogPath = resolve(this.catalogDir, `${defaultSku}.json`);
    if (!existsSync(catalogPath)) {
      writeJsonFile(catalogPath, {
        sku: defaultSku,
        name: "Golden Fields Organic Hard Red Wheat Flour (50 lb Bag)",
        basePriceUsd: 10,
        basePriceCents: 1000,
        tiers: [
          { tier: 1, minUnits: 100, priceUsd: 10, priceCents: 1000, discountPct: 0 },
          { tier: 2, minUnits: 500, priceUsd: 7.2, priceCents: 720, discountPct: 28 },
          { tier: 3, minUnits: 1000, priceUsd: 5.8, priceCents: 580, discountPct: 42 }
        ],
        updatedAt: new Date().toISOString()
      });
    }

    const defaultSmes = [
      {
        id: "sme_austin_01",
        businessName: "Austin Artisan Bakery",
        maxAutoAuthorizeUsd: 1500,
        maxSpendCents: 150000,
        stepUpThresholdCents: 100000,
        creditTier: "A",
        status: "VERIFIED_KYB"
      },
      {
        id: "sme_bean_02",
        businessName: "Bean & Leaf Coffee Roasters",
        maxAutoAuthorizeUsd: 3000,
        maxSpendCents: 300000,
        stepUpThresholdCents: 200000,
        creditTier: "A",
        status: "VERIFIED_KYB"
      },
      {
        id: "sme_green_03",
        businessName: "GreenLeaf Organics Cafe",
        maxAutoAuthorizeUsd: 1000,
        maxSpendCents: 100000,
        stepUpThresholdCents: 80000,
        creditTier: "A",
        status: "VERIFIED_KYB"
      }
    ];

    for (const sme of defaultSmes) {
      const smePath = resolve(this.smeDir, `${sme.id}.json`);
      if (!existsSync(smePath)) {
        writeJsonFile(smePath, {
          ...sme,
          updatedAt: new Date().toISOString()
        });
      }
    }
  }

  getSmeProfile(buyerId) {
    const filePath = resolve(this.smeDir, `${buyerId}.json`);
    return readJsonFile(filePath, null);
  }

  saveSmeProfile(profile) {
    if (!profile.id) throw new Error("SME profile requires an id.");
    const filePath = resolve(this.smeDir, `${profile.id}.json`);
    const record = {
      ...profile,
      updatedAt: new Date().toISOString()
    };
    writeJsonFile(filePath, record);
    return record;
  }

  getCatalogTiers(sku) {
    const filePath = resolve(this.catalogDir, `${sku}.json`);
    return readJsonFile(filePath, null);
  }

  recordNegotiationDecision(coalitionId, decision) {
    const filePath = resolve(this.decisionsDir, `${coalitionId}.json`);
    const existing = readJsonFile(filePath, []);
    const record = {
      decisionId: `dec_${Date.now()}`,
      coalitionId,
      timestamp: new Date().toISOString(),
      decision
    };
    existing.push(record);
    writeJsonFile(filePath, existing);
    return record;
  }

  getNegotiationHistory(coalitionId) {
    const filePath = resolve(this.decisionsDir, `${coalitionId}.json`);
    return readJsonFile(filePath, []);
  }
}

export const memoryStore = new InstinctMemoryStore();
