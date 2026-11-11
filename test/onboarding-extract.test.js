import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { readDocument, readByPattern, verifyProfile } from "../src/lib/onboarding-extract.js";

const KIT = "src/web/public/demo-kits/";
const invoice = await readDocument({ buffer: readFileSync(`${KIT}neon-dumpling-invoice.pdf`), mimeType: "application/pdf", fileName: "neon-dumpling-invoice.pdf" });

test("a PDF is read with no system tools", () => {
  assert.equal(invoice.kind, "pdf");
  assert.match(invoice.text, /BILLED TO/);
  assert.match(invoice.text, /Neon Dumpling Co\./);
});

test("the buyer is read from the billed-to block, not the supplier", () => {
  const fields = verifyProfile(readByPattern(invoice.text), invoice.text);
  assert.equal(fields.businessName, "Neon Dumpling Co.");
  assert.equal(fields.currentSupplier, "Garden State Paper & Packaging");
  assert.equal(fields.city, "New York");
  assert.equal(fields.borough, "Brooklyn");
});

test("prices and quantities are copied from the lines, and the first line is the main product", () => {
  const fields = verifyProfile(readByPattern(invoice.text), invoice.text);
  assert.equal(fields.units, 12);
  assert.equal(fields.currentUnitPriceUsd, 31.5);
  assert.equal(fields.products.length, 3);
});

test("a value that is not in the documents is dropped, never kept", () => {
  const fields = verifyProfile({ businessName: "Acme Corporation", currentSupplier: "Sysco", units: 999, currentSupplierPrice: 28, city: "Paris", country: "France", contactEmail: "ceo@acme.example", products: [{ name: "Gold bars", quantity: 5, unitPriceUsd: 28 }] }, invoice.text);
  assert.equal(fields.businessName, undefined);
  assert.equal(fields.currentSupplier, undefined);
  assert.equal(fields.units, undefined);
  assert.equal(fields.city, undefined);
  assert.equal(fields.country, undefined);
  assert.equal(fields.contactEmail, undefined);
  assert.equal(fields.products, undefined);
});

test("plurals still match, so 'takeout containers' is found in 'takeout container'", () => {
  const fields = verifyProfile({ mainProduct: "takeout containers", products: [{ name: "Kraft takeout container 32 oz with lid, case of 150", quantity: 12, unitPriceUsd: 31.5 }] }, invoice.text);
  assert.equal(fields.mainProduct, "takeout containers");
});

test("a spreadsheet and an unsupported file type are handled", async () => {
  const sheet = await readDocument({ buffer: readFileSync(`${KIT}neon-dumpling-inventory.csv`), mimeType: "text/csv", fileName: "inventory.csv" });
  assert.match(sheet.text, /Jasmine rice/);
  await assert.rejects(() => readDocument({ buffer: Buffer.from("hello"), mimeType: "application/zip", fileName: "x.zip" }), /not a type we can read/);
  await assert.rejects(() => readDocument({ buffer: Buffer.alloc(0), mimeType: "text/csv", fileName: "empty.csv" }), /empty/);
});
