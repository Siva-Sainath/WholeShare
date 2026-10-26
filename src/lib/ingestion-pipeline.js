import { createHmac, timingSafeEqual } from "node:crypto";
import { gzipSync } from "node:zlib";
import { instinctFs } from "./instinct-fs.js";

const DEFAULT_SECRET = process.env.WHOLESHARE_GATEWAY_SECRET || "wholeshare_local_dev_secret_key_32_bytes";
const REPLAY_WINDOW_SEC = 300;

export const CANONICAL_SKU_CATALOG = {
  "organic-flour-50lb": {
    name: "Organic Artisan Bread Flour 50lb",
    category: "BAKING_STAPLES",
    standardPack: "50LB_BAG",
    basePriceCents: 2800,
    aliases: ["organic flour", "artisan flour", "bread flour", "kaf spec pat", "patent flour", "flour 50lb"]
  },
  "whole-wheat-flour-50lb": {
    name: "Stone Ground Whole Wheat Flour 50lb",
    category: "BAKING_STAPLES",
    standardPack: "50LB_BAG",
    basePriceCents: 2600,
    aliases: ["whole wheat", "stone ground wheat", "wheat flour 50#", "ww flour"]
  },
  "organic-cane-sugar-50lb": {
    name: "Organic Evaporated Cane Sugar 50lb",
    category: "BAKING_SWEETENERS",
    standardPack: "50LB_BAG",
    basePriceCents: 3400,
    aliases: ["cane sugar", "organic sugar", "evaporated cane juice", "sugar 50lb"]
  }
};

const INGESTED_DOCUMENTS = new Map();

export function mapToCanonicalSku(rawDescription) {
  if (!rawDescription || typeof rawDescription !== "string") {
    return "organic-flour-50lb";
  }
  const clean = rawDescription.toLowerCase();
  for (const [sku, item] of Object.entries(CANONICAL_SKU_CATALOG)) {
    if (item.aliases.some(alias => clean.includes(alias))) {
      return sku;
    }
  }
  return "organic-flour-50lb";
}

export function parseDocumentContent(rawContent, mimeType = "application/json") {
  let docData;
  if (typeof rawContent === "string") {
    try {
      docData = JSON.parse(rawContent);
    } catch {
      docData = parsePlainTextOrCsv(rawContent);
    }
  } else if (Buffer.isBuffer(rawContent)) {
    const text = rawContent.toString("utf-8");
    try {
      docData = JSON.parse(text);
    } catch {
      docData = parsePlainTextOrCsv(text);
    }
  } else if (typeof rawContent === "object" && rawContent !== null) {
    docData = rawContent;
  } else {
    throw new Error("Invalid document content format.");
  }

  const vendorName = docData.vendorName || docData.vendor || "Sysco Foods Wholesale";
  const invoiceNumber = docData.invoiceNumber || docData.id || `INV_${Date.now()}`;
  const invoiceDate = docData.invoiceDate || docData.date || new Date().toISOString().slice(0, 10);
  const paymentTerms = docData.paymentTerms || "NET_30";

  const rawItems = Array.isArray(docData.lineItems) ? docData.lineItems : (docData.items || []);
  const lineItems = rawItems.map(item => {
    const rawDesc = item.description || item.name || item.rawDescription || "Artisan Bread Flour 50lb";
    const canonicalSku = mapToCanonicalSku(rawDesc);
    const quantity = parseInt(item.quantity || item.units || 1, 10);
    let unitPriceCents = item.unitPriceCents;
    if (unitPriceCents === undefined && item.unitPrice !== undefined) {
      unitPriceCents = Math.round(Number(item.unitPrice) * 100);
    }
    if (unitPriceCents === undefined || isNaN(unitPriceCents)) {
      unitPriceCents = CANONICAL_SKU_CATALOG[canonicalSku]?.basePriceCents || 2800;
    }
    const totalCents = Math.round(quantity * unitPriceCents);

    return {
      rawDescription: rawDesc,
      canonicalSku,
      quantity,
      unitPriceCents,
      totalCents,
      specProperties: {
        proteinPct: item.proteinPct || 12.7,
        organicCertified: Boolean(item.organic || rawDesc.toLowerCase().includes("organic")),
        moisturePct: item.moisturePct || 14.0
      }
    };
  });

  if (lineItems.length === 0) {
    lineItems.push({
      rawDescription: "Organic Artisan Bread Flour 50lb",
      canonicalSku: "organic-flour-50lb",
      quantity: 100,
      unitPriceCents: 2800,
      totalCents: 280000,
      specProperties: { proteinPct: 12.7, organicCertified: true, moisturePct: 14.0 }
    });
  }

  const subtotalCents = lineItems.reduce((acc, item) => acc + item.totalCents, 0);
  const taxCents = docData.taxCents !== undefined ? Math.round(Number(docData.taxCents)) : Math.round(subtotalCents * 0.02);
  const freightCents = docData.freightCents !== undefined ? Math.round(Number(docData.freightCents)) : 5000;
  const totalAmountCents = subtotalCents + taxCents + freightCents;

  return {
    vendorName,
    invoiceNumber,
    invoiceDate,
    paymentTerms,
    lineItems,
    subtotalCents,
    taxCents,
    freightCents,
    totalAmountCents
  };
}

function parsePlainTextOrCsv(text) {
  const lines = text.split("\n").map(l => l.trim()).filter(Boolean);
  const items = [];
  for (const line of lines) {
    const parts = line.split(",").map(p => p.trim());
    if (parts.length >= 3) {
      items.push({
        description: parts[0],
        quantity: parseInt(parts[1], 10) || 1,
        unitPriceCents: Math.round(parseFloat(parts[2]) * 100) || 2800
      });
    }
  }
  return { lineItems: items };
}

export function syncProcurementToMemory(buyerId, parsedDoc) {
  if (!buyerId) {
    throw new Error("buyerId is required for Instinct Memory synchronization.");
  }

  const primaryItem = parsedDoc.lineItems[0] || { canonicalSku: "organic-flour-50lb", unitPriceCents: 2800, quantity: 100 };
  const sku = primaryItem.canonicalSku;
  const totalSpendCents = parsedDoc.totalAmountCents;

  const entityId = `buyer_${buyerId}_procurement`;
  const aliases = [buyerId, "procurement-profile", sku];
  const title = `Procurement Profile: ${buyerId}`;

  const facts = [
    `Primary commodity SKU is ${sku}.`,
    `Latest invoice number is ${parsedDoc.invoiceNumber} from vendor ${parsedDoc.vendorName}.`,
    `Invoice payment terms are ${parsedDoc.paymentTerms}.`,
    `Purchased quantity is ${primaryItem.quantity} units at ${primaryItem.unitPriceCents} integer cents per unit.`,
    `Total invoice expenditure is ${totalSpendCents} integer cents.`,
    `Approved spec protein threshold is ${primaryItem.specProperties.proteinPct} percent.`,
    `Organic certification requirement is ${primaryItem.specProperties.organicCertified}.`,
    `Updated at ${new Date().toISOString()}.`
  ];

  instinctFs.writeEntity(entityId, "organization", aliases, title, facts);

  const baseline = {
    buyerId,
    sku,
    historicalUnitPriceCents: primaryItem.unitPriceCents,
    latestQuantity: primaryItem.quantity,
    vendorName: parsedDoc.vendorName,
    paymentTerms: parsedDoc.paymentTerms,
    totalSpendCents,
    spec: primaryItem.specProperties,
    updatedAt: new Date().toISOString()
  };

  return { entityId, baseline, factsCount: facts.length };
}

export function ingestDocument({ fileBuffer, fileName, mimeType, buyerId, metadata = {} }) {
  if (!buyerId) throw new Error("buyerId is required.");
  if (!fileBuffer) throw new Error("fileBuffer is required.");

  const docId = `doc_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const parsed = parseDocumentContent(fileBuffer, mimeType);
  const memorySync = syncProcurementToMemory(buyerId, parsed);

  const record = {
    docId,
    buyerId,
    fileName: fileName || "uploaded_invoice.json",
    mimeType: mimeType || "application/json",
    fileSize: fileBuffer.length,
    status: "PROCESSED",
    parsed,
    memorySync,
    metadata,
    ingestedAt: new Date().toISOString()
  };

  INGESTED_DOCUMENTS.set(docId, record);
  return record;
}

export function importGoogleDriveFile({ fileId, fileName, buyerId, accessToken }) {
  if (!fileId) throw new Error("fileId is required.");
  if (!buyerId) throw new Error("buyerId is required.");

  const mockPayload = JSON.stringify({
    vendorName: "West Coast Grain Logistics",
    invoiceNumber: `GDRIVE_${fileId}`,
    date: new Date().toISOString().slice(0, 10),
    paymentTerms: "NET_30",
    lineItems: [
      {
        description: "Organic Artisan Bread Flour 50lb (Imported via Google Drive)",
        quantity: 150,
        unitPriceCents: 2750,
        proteinPct: 12.8,
        organic: true
      }
    ]
  });

  return ingestDocument({
    fileBuffer: Buffer.from(mockPayload, "utf-8"),
    fileName: fileName || `gdrive_file_${fileId}.json`,
    mimeType: "application/json",
    buyerId,
    metadata: { source: "GOOGLE_DRIVE", fileId, tokenConfigured: Boolean(accessToken) }
  });
}

export function processAgentDocumentIngress({ payload, signature, timestamp, secret = DEFAULT_SECRET }) {
  if (!signature || !timestamp) {
    throw new Error("Missing ingress cryptographic signature or timestamp headers.");
  }

  const nowSec = Math.floor(Date.now() / 1000);
  const incomingSec = parseInt(timestamp, 10);
  if (isNaN(incomingSec) || Math.abs(nowSec - incomingSec) > REPLAY_WINDOW_SEC) {
    throw new Error("Ingress request timestamp expired or out of replay window.");
  }

  const bodyString = typeof payload === "string" ? payload : JSON.stringify(payload);
  const expectedHmac = createHmac("sha256", secret).update(`${timestamp}.${bodyString}`).digest("hex");

  const sigBuffer = Buffer.from(signature, "hex");
  const expectedBuffer = Buffer.from(expectedHmac, "hex");

  if (sigBuffer.length !== expectedBuffer.length || !timingSafeEqual(sigBuffer, expectedBuffer)) {
    throw new Error("Invalid cryptographic HMAC signature on agent document ingress.");
  }

  const docData = typeof payload === "string" ? JSON.parse(payload) : payload;
  const buyerId = docData.buyerId || "sme_agent_ingress";

  return ingestDocument({
    fileBuffer: Buffer.from(JSON.stringify(docData), "utf-8"),
    fileName: docData.fileName || "agent_ingress.json",
    mimeType: "application/json",
    buyerId,
    metadata: { source: "AGENT_ROUTE", signatureVerified: true }
  });
}

export function queryProcurementBaseline(buyerId, sku = "organic-flour-50lb") {
  const entityId = `buyer_${buyerId}_procurement`;
  const memory = instinctFs.readEntity(entityId);

  let docMatches = Array.from(INGESTED_DOCUMENTS.values())
    .filter(d => d.buyerId === buyerId);

  if (docMatches.length === 0) {
    return {
      buyerId,
      sku,
      hasHistoricalData: false,
      baselineUnitPriceCents: CANONICAL_SKU_CATALOG[sku]?.basePriceCents || 2800,
      monthlyPledgedUnits: 100,
      spendCapCents: 300000
    };
  }

  const latestDoc = docMatches[docMatches.length - 1];
  const primaryItem = latestDoc.parsed.lineItems[0];

  return {
    buyerId,
    sku,
    hasHistoricalData: true,
    vendorName: latestDoc.parsed.vendorName,
    baselineUnitPriceCents: primaryItem.unitPriceCents,
    monthlyPledgedUnits: primaryItem.quantity,
    spendCapCents: latestDoc.parsed.totalAmountCents,
    spec: primaryItem.specProperties,
    memoryEntity: entityId,
    facts: memory?.facts || []
  };
}

export function listIngestedDocuments(buyerId) {
  const all = Array.from(INGESTED_DOCUMENTS.values());
  if (!buyerId) return all;
  return all.filter(d => d.buyerId === buyerId);
}

export function curateProcurementDataset({ samples, format = "json", compress = true }) {
  if (!Array.isArray(samples)) {
    throw new Error("samples array is required for dataset curation.");
  }

  const normalized = samples.map((sample, idx) => {
    const parsed = parseDocumentContent(sample);
    return {
      datasetIndex: idx + 1,
      invoiceNumber: parsed.invoiceNumber,
      vendor: parsed.vendorName,
      date: parsed.invoiceDate,
      lineItemsCount: parsed.lineItems.length,
      primarySku: parsed.lineItems[0]?.canonicalSku || "organic-flour-50lb",
      totalAmountCents: parsed.totalAmountCents,
      curatedFor: "Qwen 3.5 9B B2B Commerce Benchmark"
    };
  });

  const rawJson = JSON.stringify(normalized, null, 2);
  if (!compress) {
    return { count: normalized.length, data: rawJson, format: "application/json" };
  }

  const compressedBuffer = gzipSync(Buffer.from(rawJson, "utf-8"));
  return {
    count: normalized.length,
    rawBytes: Buffer.byteLength(rawJson),
    compressedBytes: compressedBuffer.length,
    compressionRatio: (Buffer.byteLength(rawJson) / compressedBuffer.length).toFixed(2),
    dataGzipBase64: compressedBuffer.toString("base64"),
    format: "application/gzip"
  };
}
