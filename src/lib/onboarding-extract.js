import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { read as readWorkbook, utils as xlsxUtils } from "xlsx";
import { storageDriver } from "./storage-driver.js";
import { modelClient } from "./model-client.js";

// Reads the documents a business already has (invoices, inventory sheets, a photo of an invoice) and returns its profile.
// Everything runs in JavaScript or WebAssembly, so it works on a plain server with no system tools installed.
// A value is kept only if it appears in the documents. Anything else is dropped and reported as missing.
// Originals and results go through the storage driver, so they land on JuiceFS when it is mounted and on the disk otherwise.

const require = createRequire(import.meta.url);
const MAX_FILE_BYTES = 6 * 1024 * 1024;
const MAX_FILES = 4;
const MAX_TEXT_CHARS = 14000;
const BOROUGHS = new Set(["brooklyn", "queens", "manhattan", "bronx", "the bronx", "staten island"]);
const COUNTRY_ALIASES = { us: "United States", usa: "United States", "u.s.": "United States", "u.s.a.": "United States", "united states of america": "United States", uk: "United Kingdom" };

const sha = (buffer) => createHash("sha256").update(buffer).digest("hex");
const stem = (word) => (word.length > 3 ? word.replace(/ies$/, "y").replace(/s$/, "") : word);
// Lower case, no punctuation and plurals reduced, so "container" and "Containers" match.
const norm = (text) => String(text ?? "").toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").trim().split(" ").filter(Boolean).map(stem).join(" ");

function kindOf({ mimeType, fileName }) {
  const name = String(fileName ?? "").toLowerCase();
  if (mimeType === "application/pdf" || name.endsWith(".pdf")) return "pdf";
  if (/^image\/(png|jpe?g|webp)$/.test(mimeType ?? "") || /\.(png|jpe?g|webp)$/.test(name)) return "image";
  if (/\.(xlsx|xls)$/.test(name) || /spreadsheetml|ms-excel/.test(mimeType ?? "")) return "sheet";
  if (name.endsWith(".csv") || mimeType === "text/csv") return "csv";
  if (/\.(txt|md|json)$/.test(name) || /^text\//.test(mimeType ?? "")) return "text";
  return "";
}

async function pdfText(buffer) {
  const { extractText, getDocumentProxy } = await import("unpdf");
  const pdf = await getDocumentProxy(new Uint8Array(buffer));
  const { text } = await extractText(pdf, { mergePages: true });
  return Array.isArray(text) ? text.join("\n") : String(text ?? "");
}

async function imageText(buffer) {
  const { createWorker } = await import("tesseract.js");
  const lang = require("@tesseract.js-data/eng");
  const worker = await createWorker("eng", 1, { langPath: lang.langPath, gzip: lang.gzip, cacheMethod: "none" });
  try {
    const { data } = await worker.recognize(buffer);
    return data.text;
  } finally {
    await worker.terminate();
  }
}

function sheetText(buffer) {
  const workbook = readWorkbook(buffer, { type: "buffer" });
  return workbook.SheetNames.slice(0, 3).map((name) => `Sheet: ${name}\n${xlsxUtils.sheet_to_csv(workbook.Sheets[name], { FS: " | " }).split("\n").slice(0, 200).join("\n")}`).join("\n\n");
}

export async function readDocument({ buffer, mimeType, fileName }) {
  const kind = kindOf({ mimeType, fileName });
  if (!kind) throw new Error(`'${fileName}' is not a type we can read. Use a PDF, an image, a CSV or an Excel file.`);
  if (!buffer || buffer.length === 0) throw new Error(`'${fileName}' is empty.`);
  if (buffer.length > MAX_FILE_BYTES) throw new Error(`'${fileName}' is larger than 6 MB.`);
  let text = "";
  let method = "";
  if (kind === "pdf") { text = await pdfText(buffer); method = "pdf text"; }
  else if (kind === "image") { text = await imageText(buffer); method = "image OCR"; }
  else if (kind === "sheet") { text = sheetText(buffer); method = "spreadsheet"; }
  else { text = buffer.toString("utf8"); method = "text"; }
  text = text.replace(/\r/g, "").replace(/[ \t]+\n/g, "\n").trim();
  if (text.length < 8) throw new Error(`Nothing readable was found in '${fileName}'.`);
  return { kind, method, text, sha256: sha(buffer) };
}

// A value counts only if it is written in the documents.
function wordsPresent(haystack, value) {
  const needle = norm(value);
  if (!needle) return false;
  if (haystack.includes(needle)) return true;
  const words = needle.split(" ").filter((word) => word.length > 1);
  return words.length >= 2 && words.every((word) => haystack.includes(word));
}

function numberPresent(rawText, value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return false;
  const variants = new Set([String(n), n.toFixed(2), n.toLocaleString("en-US"), n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })]);
  for (const variant of variants) {
    const escaped = variant.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if (new RegExp(`(^|[^\\d.,])${escaped}(?![\\d])`).test(rawText)) return true;
  }
  return false;
}

const SYSTEM = `You read a business's own documents (supplier invoices, inventory sheets, purchase orders) and return the profile of the BUYER: the business that receives the goods or owns the inventory. The supplier is the business that issued the invoice.
Return one JSON object with only the fields that are written in the documents. Never guess or invent anything. Leave a field out when it is not there.
Fields:
- businessName: the buyer (the "billed to" or "ship to" business), never the supplier.
- address: the buyer's street address.
- city, state, country (full country name), contactEmail: the buyer's.
- industry: one of RESTAURANT, FOOD_AND_BEVERAGE, RETAIL, MANUFACTURING, HEALTHCARE, CONSTRUCTION, TEXTILES, ELECTRONICS, OTHER. Only when clear.
- currentSupplier: the supplier who issued the invoice. If several, the one with the largest spend.
- invoiceNumber, invoiceDate (YYYY-MM-DD).
- products: array of {name, unit, quantity, unitPriceUsd, supplier}, copied from the lines. quantity and unitPriceUsd are numbers copied exactly. Skip lines you cannot read.
- mainProduct: 2 to 4 plain words naming the FIRST product line on the invoice, for example "takeout containers".
- units: the quantity bought of that first product, as an integer.
Output JSON only.`;

function cleanProducts(list, raw) {
  const haystack = norm(raw);
  return (Array.isArray(list) ? list : []).slice(0, 12).map((item) => {
    const name = String(item?.name ?? "").trim().slice(0, 120);
    if (!name || !wordsPresent(haystack, name)) return null;
    const quantity = Number(item?.quantity);
    const price = Number(item?.unitPriceUsd);
    return {
      name,
      unit: String(item?.unit ?? "").trim().slice(0, 40),
      ...(Number.isFinite(quantity) && quantity > 0 && numberPresent(raw, quantity) ? { quantity: Math.round(quantity) } : {}),
      ...(Number.isFinite(price) && price > 0 && numberPresent(raw, price) ? { unitPriceUsd: Math.round(price * 100) / 100 } : {}),
      ...(item?.supplier && wordsPresent(haystack, item.supplier) ? { supplier: String(item.supplier).trim().slice(0, 100) } : {})
    };
  }).filter(Boolean);
}

export function verifyProfile(data, raw) {
  const haystack = norm(raw);
  const out = {};
  const text = (key, max = 120) => {
    const value = String(data?.[key] ?? "").trim();
    if (value && wordsPresent(haystack, value)) out[key] = value.slice(0, max);
  };
  for (const key of ["businessName", "address", "city", "state", "currentSupplier", "invoiceNumber"]) text(key);
  const email = String(data?.contactEmail ?? "").trim();
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && raw.toLowerCase().includes(email.toLowerCase())) out.contactEmail = email.slice(0, 120);
  const country = String(data?.country ?? "").trim();
  if (country) {
    const full = COUNTRY_ALIASES[country.toLowerCase()] ?? country;
    const aliases = Object.entries(COUNTRY_ALIASES).filter(([, name]) => name === full).map(([alias]) => alias);
    if (wordsPresent(haystack, full) || aliases.some((alias) => new RegExp(`(^|[^a-z])${alias.replace(/\./g, "\\.")}([^a-z]|$)`, "i").test(raw))) out.country = full;
  }
  const date = String(data?.invoiceDate ?? "");
  if (/^\d{4}-\d{2}-\d{2}$/.test(date) && raw.includes(date)) out.invoiceDate = date;
  if (["RESTAURANT", "FOOD_AND_BEVERAGE", "RETAIL", "MANUFACTURING", "HEALTHCARE", "CONSTRUCTION", "TEXTILES", "ELECTRONICS", "OTHER"].includes(String(data?.industry))) out.industry = data.industry;
  const products = cleanProducts(data?.products, raw);
  if (products.length) out.products = products;
  const main = String(data?.mainProduct ?? "").trim().slice(0, 60);
  if (main && (products.some((p) => wordsPresent(norm(p.name), main) || wordsPresent(norm(main), p.name)) || wordsPresent(haystack, main))) out.mainProduct = main;
  const units = Math.round(Number(data?.units));
  if (Number.isFinite(units) && units > 0 && numberPresent(raw, units)) out.units = units;
  // New York City boroughs are the city of New York for matching groups. The borough stays in the address.
  if (out.city && BOROUGHS.has(out.city.toLowerCase())) { out.borough = out.city; out.city = "New York"; }
  const priced = products.filter((p) => p.unitPriceUsd && p.quantity);
  if (priced.length) {
    // The first line on the invoice is the product the business is here to buy.
    const first = priced[0];
    out.currentUnitPriceUsd = first.unitPriceUsd;
    out.units = first.quantity;
    if (!out.mainProduct) out.mainProduct = first.name.split(",")[0].slice(0, 60);
  }
  return out;
}

// A plain reading of the common layout, used only when the model cannot be reached. It copies text; it never fills a gap.
export function readByPattern(raw) {
  const out = {};
  const billed = raw.match(/BILLED TO[:\s]*\n?([^\n]+)\n([^\n]+)\n([^\n,]+),?\s*([A-Z]{2})?\s*(\d{5})?/i);
  if (billed) { out.businessName = billed[1].trim(); out.address = billed[2].trim(); out.city = billed[3].trim(); if (billed[4]) out.state = billed[4]; }
  const num = raw.match(/Invoice (?:number|#)[:\s]*([A-Z0-9-]{4,})/i);
  if (num) out.invoiceNumber = num[1];
  const products = [];
  for (const line of raw.split("\n")) {
    const m = line.match(/^(?:[A-Z0-9-]{4,}\s+)?(.{8,90}?)\s+(\d{1,5})\s+(case|cases|unit|units|bag|bags|jug|jugs|box|boxes|each)\s+\$?([\d,]+\.\d{2})\s+\$?([\d,]+\.\d{2})\s*$/i);
    if (m) products.push({ name: m[1].trim(), unit: m[3], quantity: Number(m[2]), unitPriceUsd: Number(m[4].replace(/,/g, "")) });
  }
  if (products.length) out.products = products;
  const vendor = raw.split("\n").map((l) => l.trim()).find((l) => l && !/invoice|date|terms/i.test(l));
  if (vendor) out.currentSupplier = vendor;
  return out;
}

function sourcesFor(fields, docs) {
  const sources = {};
  for (const [key, value] of Object.entries(fields)) {
    if (typeof value === "object") continue;
    const hit = docs.find((doc) => (typeof value === "number" ? numberPresent(doc.text, value) : wordsPresent(norm(doc.text), value)));
    if (hit) sources[key] = hit.fileName;
  }
  return sources;
}

export async function extractOnboardingProfile(files) {
  if (!Array.isArray(files) || files.length === 0) throw new Error("Add at least one document.");
  if (files.length > MAX_FILES) throw new Error(`Add up to ${MAX_FILES} documents at a time.`);
  const docs = [];
  for (const file of files) {
    const buffer = Buffer.isBuffer(file.buffer) ? file.buffer : Buffer.from(String(file.base64 ?? ""), "base64");
    const read = await readDocument({ buffer, mimeType: file.mimeType, fileName: file.fileName });
    const extension = (String(file.fileName ?? "").split(".").pop() || "bin").replace(/[^a-z0-9]/gi, "").slice(0, 5).toLowerCase();
    storageDriver.writeBinaryAtomic(resolve(storageDriver.lakeDir, "bronze", "documents", `${read.sha256}.${extension}`), buffer);
    docs.push({ fileName: String(file.fileName ?? "document").slice(0, 120), ...read });
  }
  const raw = docs.map((doc) => `=== ${doc.fileName} (${doc.method}) ===\n${doc.text}`).join("\n\n").slice(0, MAX_TEXT_CHARS);

  let data = null;
  let reader = "model";
  try {
    ({ data } = await modelClient.callJsonPrompt({ systemPrompt: SYSTEM, userPrompt: raw, maxTokens: 1500 }));
  } catch {
    data = readByPattern(raw);
    reader = "pattern";
  }
  const fields = verifyProfile(data, raw);
  // The pattern reader is a safety net. If the model gave nothing usable, fall back to it as well.
  if (reader === "model" && !fields.businessName) Object.assign(fields, { ...verifyProfile(readByPattern(raw), raw), ...fields });
  const missing = ["businessName", "city", "country", "mainProduct", "units"].filter((key) => fields[key] === undefined);
  const result = { fields, missing, sources: sourcesFor(fields, docs), files: docs.map((doc) => ({ name: doc.fileName, kind: doc.kind, method: doc.method, characters: doc.text.length })), reader, storage: storageDriver.driverType };
  storageDriver.writeAtomic(resolve(storageDriver.lakeDir, "silver", "onboarding", `${sha(Buffer.from(docs.map((d) => d.sha256).join()))}.json`), JSON.stringify({ ...result, extractedAt: new Date().toISOString() }, null, 2));
  return result;
}
