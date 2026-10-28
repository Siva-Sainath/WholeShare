import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

test("Procured datasets manifest exists and catalogues 20,000+ real records", () => {
  const manifestPath = path.resolve("data/procured/manifest.json");
  assert.ok(fs.existsSync(manifestPath), "Manifest file must exist");

  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
  assert.ok(manifest.total_records >= 20000, `Expected >= 20000 records, got ${manifest.total_records}`);
  assert.ok(manifest.total_size_mb >= 300, `Expected >= 300 MB, got ${manifest.total_size_mb}`);
  assert.equal(manifest.datasets.length, 7);
});

test("TAT-QA hybrid financial reasoning dataset contains valid table-text questions", () => {
  const filePath = path.resolve("data/procured/financial_reasoning_tatqa.json");
  assert.ok(fs.existsSync(filePath));

  const data = JSON.parse(fs.readFileSync(filePath, "utf-8"));
  assert.ok(Array.isArray(data));
  assert.ok(data.length >= 2000);

  const sample = data[0];
  assert.ok(sample.table, "Must contain table data");
  assert.ok(sample.paragraphs, "Must contain narrative text");
  assert.ok(sample.questions, "Must contain questions");
});

test("CUAD commercial contracts contains master clauses and agreement terms", () => {
  const filePath = path.resolve("data/procured/commercial_contracts_cuad.csv");
  assert.ok(fs.existsSync(filePath));

  const content = fs.readFileSync(filePath, "utf-8");
  const firstLine = content.split("\n")[0];
  assert.ok(firstLine.includes("Parties"));
  assert.ok(firstLine.includes("Agreement Date"));
  assert.ok(content.length > 1000000);
});

test("CFPB dispute database contains consumer dispute narratives and issues", () => {
  const filePath = path.resolve("data/procured/financial_disputes_cfpb.csv");
  assert.ok(fs.existsSync(filePath));

  const content = fs.readFileSync(filePath, "utf-8");
  assert.ok(content.includes("consumer_narrative"));
  assert.ok(content.includes("issue"));
  assert.ok(content.includes("product"));
});

test("International HS Codes contains 9,000+ trade commodity classifications", () => {
  const filePath = path.resolve("data/procured/international_hs_codes.csv");
  assert.ok(fs.existsSync(filePath));

  const content = fs.readFileSync(filePath, "utf-8");
  const lines = content.split("\n");
  assert.ok(lines.length >= 9000);
});

test("FinQA contains multi-step financial math reasoning problems", () => {
  const filePath = path.resolve("data/procured/financial_reasoning_finqa.json");
  assert.ok(fs.existsSync(filePath));

  const data = JSON.parse(fs.readFileSync(filePath, "utf-8"));
  assert.ok(Array.isArray(data));
  assert.ok(data.length >= 6000);

  const sample = data[0];
  assert.ok(sample.qa, "Must contain QA block");
  assert.ok(sample.qa.question, "Must contain question");
});

test("Hermes-Glaive dataset contains multi-turn tool calling and schema arguments", () => {
  const filePath = path.resolve("data/procured/function_calling_hermes_glaive.json");
  assert.ok(fs.existsSync(filePath));

  const data = JSON.parse(fs.readFileSync(filePath, "utf-8"));
  assert.ok(Array.isArray(data));
  assert.ok(data.length >= 5000);

  const sample = data[0];
  assert.ok(sample.conversations, "Must contain conversations");
});

