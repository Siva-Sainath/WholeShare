import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { storageDriver } from "./storage-driver.js";
import { extractOcrTextFromBuffer, isImageBuffer } from "./ingestion-pipeline.js";
import { isCarrierFormatTracking } from "./tracking-format.js";

// Damage photos are written to the lake (bronze/evidence) through the storage driver,
// so they land on JuiceFS when JUICEFS_MOUNT_PATH is mounted and on local disk otherwise.
// Tesseract OCR runs on each photo to read visible text such as a carrier label.
// The model never sees the image. It only receives the file reference and any text found.

const MAX_BYTES = 6 * 1024 * 1024;
const EXTENSIONS = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "application/pdf": "pdf" };

function evidenceDir() {
  return resolve(storageDriver.lakeDir, "bronze", "evidence");
}

function indexPath() {
  return resolve(evidenceDir(), "index.json");
}

function readIndex() {
  const file = indexPath();
  return existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : {};
}

function findTrackingNumbers(text) {
  const candidates = text.toUpperCase().match(/\b[0-9A-Z]{10,22}\b/g) || [];
  return [...new Set(candidates.filter((value) => isCarrierFormatTracking(value)))].slice(0, 3);
}

export function saveEvidence({ buffer, mimeType, fileName, clanId = null }) {
  const extension = EXTENSIONS[mimeType];
  if (!extension) throw new Error("Attach a PNG, JPEG or WebP photo, or a PDF.");
  if (!buffer || buffer.length === 0) throw new Error("The photo is empty.");
  if (buffer.length > MAX_BYTES) throw new Error("The photo is larger than 6 MB.");
  const isPdf = mimeType === "application/pdf";
  if (isPdf ? buffer.subarray(0, 4).toString("latin1") !== "%PDF" : !isImageBuffer(buffer)) throw new Error(isPdf ? "The file is not a valid PDF." : "The file is not a valid image.");

  const sha256 = createHash("sha256").update(buffer).digest("hex");
  const evidenceId = sha256.slice(0, 16);
  const target = resolve(evidenceDir(), `${evidenceId}.${extension}`);
  storageDriver.writeBinaryAtomic(target, buffer);

  const ocrText = isPdf ? "" : extractOcrTextFromBuffer(buffer);
  const record = {
    evidenceId,
    uri: `/api/v1/evidence/${evidenceId}`,
    fileName: String(fileName || `photo.${extension}`).slice(0, 120),
    mimeType,
    extension,
    bytes: buffer.length,
    sha256,
    clanId,
    storage: storageDriver.driverType,
    detectedTrackingNumbers: findTrackingNumbers(ocrText),
    ocrCharacters: ocrText.length,
    storedAt: new Date().toISOString()
  };
  const index = readIndex();
  index[evidenceId] = record;
  storageDriver.writeAtomic(indexPath(), JSON.stringify(index, null, 2));
  return record;
}

export function getEvidence(evidenceId) {
  const record = readIndex()[evidenceId];
  if (!record) return null;
  const file = resolve(evidenceDir(), `${record.evidenceId}.${record.extension}`);
  if (!existsSync(file)) return null;
  return { record, buffer: readFileSync(file) };
}
