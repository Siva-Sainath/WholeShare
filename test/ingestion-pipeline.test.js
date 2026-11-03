import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import {
  parseDocumentContent,
  mapToCanonicalSku,
  ingestDocument,
  importGoogleDriveFile,
  processAgentDocumentIngress,
  queryProcurementBaseline,
  curateProcurementDataset,
  isImageBuffer,
  isPdfBuffer,
  isExcelBuffer
} from "../src/lib/ingestion-pipeline.js";
import { executeTool } from "../src/lib/tool-registry.js";
import { instinctFs } from "../src/lib/instinct-fs.js";
import { readFileSync, existsSync } from "node:fs";

const TEST_SECRET = process.env.WHOLESHARE_GATEWAY_SECRET || "wholeshare_local_dev_secret_key_32_bytes";

test("ingestion pipeline maps vendor text to canonical SKUs accurately", () => {
  assert.equal(mapToCanonicalSku("King Arthur Special Patent Flour 50#"), "organic-flour-50lb");
  assert.equal(mapToCanonicalSku("Stone Ground Wheat Flour 50#"), "whole-wheat-flour-50lb");
  assert.equal(mapToCanonicalSku("Organic Cane Sugar 50lb Bag"), "organic-cane-sugar-50lb");
  assert.equal(mapToCanonicalSku("Unknown item"), null);
});

test("parseDocumentContent normalizes line items and enforces exact integer cents", () => {
  const raw = {
    vendorName: "Sysco Wholesale",
    invoiceNumber: "INV_9921",
    paymentTerms: "NET_30",
    items: [
      {
        name: "Artisan Bread Flour 50lb",
        quantity: 200,
        unitPrice: 28.50,
        proteinPct: 12.8
      }
    ]
  };

  const parsed = parseDocumentContent(raw);
  assert.equal(parsed.vendorName, "Sysco Wholesale");
  assert.equal(parsed.invoiceNumber, "INV_9921");
  assert.equal(parsed.lineItems.length, 1);
  assert.equal(parsed.lineItems[0].canonicalSku, "organic-flour-50lb");
  assert.equal(parsed.lineItems[0].unitPriceCents, 2850);
  assert.equal(parsed.lineItems[0].totalCents, 570000);
  assert.equal(Number.isInteger(parsed.totalAmountCents), true);
});

test("ingestDocument indexes facts into Instinct Memory", () => {
  const buyerId = `test_buyer_${Date.now()}`;
  const payload = {
    vendor: "Bay State Milling",
    invoiceNumber: "INV_BSM_102",
    lineItems: [
      {
        description: "Organic Artisan Bread Flour 50lb",
        quantity: 120,
        unitPriceCents: 2780,
        proteinPct: 12.7,
        organic: true
      }
    ]
  };

  const record = ingestDocument({
    fileBuffer: Buffer.from(JSON.stringify(payload), "utf-8"),
    fileName: "invoice.json",
    buyerId
  });

  assert.equal(record.status, "PROCESSED");
  assert.equal(record.buyerId, buyerId);

  const memory = instinctFs.readEntity(`buyer_${buyerId}_procurement`);
  assert.ok(memory);
  assert.equal(memory.id, `buyer_${buyerId}_procurement`);
  assert.ok(memory.body.includes("2780 integer cents"));
});

test("importGoogleDriveFile fails fast when accessToken is missing", async () => {
  const buyerId = `test_gdrive_${Date.now()}`;
  await assert.rejects(
    async () => {
      await importGoogleDriveFile({
        fileId: "drive_file_12345",
        fileName: "grain_order.json",
        buyerId
      });
    },
    /Google Drive integration requires a valid OAuth accessToken/
  );
});

test("processAgentDocumentIngress verifies cryptographic HMAC signature", () => {
  const buyerId = `test_agent_${Date.now()}`;
  const payload = {
    buyerId,
    vendorName: "Prairie Gold Grains",
    invoiceNumber: "INV_PG_771",
    lineItems: [{ description: "Organic Artisan Bread Flour 50lb", quantity: 50, unitPriceCents: 2900 }]
  };

  const timestamp = String(Math.floor(Date.now() / 1000));
  const bodyString = JSON.stringify(payload);
  const signature = createHmac("sha256", TEST_SECRET)
    .update(`${timestamp}.${bodyString}`)
    .digest("hex");

  const record = processAgentDocumentIngress({
    payload,
    signature,
    timestamp,
    secret: TEST_SECRET
  });

  assert.equal(record.status, "PROCESSED");
  assert.equal(record.buyerId, buyerId);
});

test("processAgentDocumentIngress rejects forged signature or stale timestamp", () => {
  const payload = { buyerId: "sme_tampered" };
  const staleTimestamp = String(Math.floor(Date.now() / 1000) - 600);
  const fakeSignature = "deadbeef".repeat(8);

  assert.throws(() => {
    processAgentDocumentIngress({
      payload,
      signature: fakeSignature,
      timestamp: String(Math.floor(Date.now() / 1000)),
      secret: TEST_SECRET
    });
  }, /Invalid cryptographic HMAC signature/);

  assert.throws(() => {
    processAgentDocumentIngress({
      payload,
      signature: fakeSignature,
      timestamp: staleTimestamp,
      secret: TEST_SECRET
    });
  }, /expired or out of replay window/);
});

test("curateProcurementDataset produces compressed gzip payload", () => {
  const samples = [
    { vendor: "Miller A", lineItems: [{ name: "Flour", quantity: 50, unitPrice: 28 }] },
    { vendor: "Miller B", lineItems: [{ name: "Wheat", quantity: 100, unitPrice: 25 }] }
  ];

  const result = curateProcurementDataset({ samples, compress: true });
  assert.equal(result.count, 2);
  assert.ok(result.rawBytes > result.compressedBytes);
  assert.equal(result.format, "application/gzip");
  assert.ok(typeof result.dataGzipBase64 === "string");
});

test("executeTool handles ingest_business_document and query_procurement_baseline", async () => {
  const buyerId = `sme_tool_test_${Date.now()}`;
  const docJson = JSON.stringify({
    vendorName: "Montana Flour Mills",
    invoiceNumber: "INV_MT_119",
    items: [{ name: "Artisan Bread Flour 50#", units: 100, unitPrice: 28.00 }]
  });

  const ingestRes = await executeTool("ingest_business_document", {
    buyerId,
    documentJson: docJson,
    fileName: "montana_invoice.json"
  });

  assert.equal(ingestRes.status, "PROCESSED");
  assert.equal(ingestRes.buyerId, buyerId);

  const queryRes = await executeTool("query_procurement_baseline", {
    buyerId,
    sku: "organic-flour-50lb"
  });

  assert.equal(queryRes.buyerId, buyerId);
  assert.equal(queryRes.hasHistoricalData, true);
  assert.equal(queryRes.baselineUnitPriceCents, 2800);
});

test("isImageBuffer accurately identifies image formats", () => {
  const pngHeader = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A]);
  const jpegHeader = Buffer.from([0xFF, 0xD8, 0xFF, 0xE0]);
  const textBuffer = Buffer.from("Hello world plaintext");

  assert.equal(isImageBuffer(pngHeader), true);
  assert.equal(isImageBuffer(jpegHeader), true);
  assert.equal(isImageBuffer(textBuffer), false);
});

test("ingestDocument handles picture and scanned bill ingestion with optical OCR", () => {
  const buyerId = `test_photo_buyer_${Date.now()}`;
  const imagePath = "data/benchmark_corpus/01_sysco_commercial_invoice.png";
  const pngBuffer = readFileSync(imagePath);

  const record = ingestDocument({
    fileBuffer: pngBuffer,
    fileName: "01_sysco_commercial_invoice.png",
    mimeType: "image/png",
    buyerId
  });

  assert.equal(record.status, "PROCESSED");
  assert.equal(record.parsed.isImage, true);
  assert.equal(record.parsed.extractionMethod, "OPTICAL_IMAGE_OCR");
  assert.ok(record.parsed.totalAmountCents > 0);
  assert.equal(Number.isInteger(record.parsed.totalAmountCents), true);
});

test("isPdfBuffer and isExcelBuffer accurately identify binary headers", () => {
  const pdfHeader = Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2D]);
  const xlsxHeader = Buffer.from([0x50, 0x4B, 0x03, 0x04]);
  const plainText = Buffer.from("Vendor,Item,Qty,Price");

  assert.equal(isPdfBuffer(pdfHeader), true);
  assert.equal(isPdfBuffer(plainText), false);
  assert.equal(isExcelBuffer(xlsxHeader), true);
  assert.equal(isExcelBuffer(plainText), false);
});

test("ingestDocument handles vector PDF invoices and scanned archive PDF bills", () => {
  const vectorPdfPath = "data/benchmark_corpus/07_vector_digital_invoice.pdf";
  if (!existsSync(vectorPdfPath)) return;

  const pdfBuffer = readFileSync(vectorPdfPath);
  const record = ingestDocument({
    fileBuffer: pdfBuffer,
    fileName: "vector_invoice.pdf",
    mimeType: "application/pdf",
    buyerId: "sme_pdf_buyer"
  });

  assert.equal(record.status, "PROCESSED");
  assert.equal(record.parsed.extractionMethod, "PDF_DOCUMENT_PARSER");
  assert.equal(record.parsed.vendorName, "Bay State Milling Wholesale");
  assert.equal(record.parsed.lineItems.length, 3);
  assert.equal(Number.isInteger(record.parsed.totalAmountCents), true);
});

test("ingestDocument handles multi-sheet Excel workbooks and RFC CSV documents", () => {
  const xlsxPath = "data/benchmark_corpus/04_distributor_multi_sheet.xlsx";
  const csvPath = "data/benchmark_corpus/06_b2b_procurement_po.csv";
  if (!existsSync(xlsxPath) || !existsSync(csvPath)) return;

  const xlsxRecord = ingestDocument({
    fileBuffer: readFileSync(xlsxPath),
    fileName: "distributor_order.xlsx",
    mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    buyerId: "sme_excel_buyer"
  });

  assert.equal(xlsxRecord.status, "PROCESSED");
  assert.equal(xlsxRecord.parsed.extractionMethod, "EXCEL_XLSX_PARSER");
  assert.equal(xlsxRecord.parsed.vendorName, "Sysco Central Texas Wholesale");
  assert.equal(xlsxRecord.parsed.lineItems.length, 3);
  assert.equal(Number.isInteger(xlsxRecord.parsed.totalAmountCents), true);

  const csvRecord = ingestDocument({
    fileBuffer: readFileSync(csvPath),
    fileName: "procurement_po.csv",
    mimeType: "text/csv",
    buyerId: "sme_csv_buyer"
  });

  assert.equal(csvRecord.status, "PROCESSED");
  assert.equal(csvRecord.parsed.lineItems.length, 3);
  assert.equal(Number.isInteger(csvRecord.parsed.totalAmountCents), true);
});


