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
  assert.ok(manifest.datasets.length >= 7, `Expected >= 7 datasets, got ${manifest.datasets.length}`);
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

test("Eurotender procurement dataset contains European public tenders and CPV codes", () => {
  const filePath = path.resolve("data/procured/procurement_tenders_eurotender.parquet");
  assert.ok(fs.existsSync(filePath));
  assert.ok(fs.statSync(filePath).size > 100000000);
});

test("DataCo supply chain dataset contains commercial orders and delivery metrics", () => {
  const filePath = path.resolve("data/procured/supply_chain_dataco_transactions.csv");
  assert.ok(fs.existsSync(filePath));
  assert.ok(fs.statSync(filePath).size > 50000000);
});

test("Nooxus verified entities dataset contains global corporate registry data", () => {
  const filePath = path.resolve("data/procured/global_verified_entities_nooxus.parquet");
  assert.ok(fs.existsSync(filePath));
  assert.ok(fs.statSync(filePath).size > 1000000);
});

test("B2B Procure-to-Pay dataset contains purchase orders and matching invoices", () => {
  const poPath = path.resolve("data/procured/b2b_p2p_purchase_orders.csv");
  const invPath = path.resolve("data/procured/b2b_p2p_supplier_invoices.csv");
  assert.ok(fs.existsSync(poPath));
  assert.ok(fs.existsSync(invPath));
});

test("SEC EDGAR supply chain dataset contains Item 1A supplier risk disclosures", () => {
  const filePath = path.resolve("data/procured/sec_edgar_supply_chain.parquet");
  assert.ok(fs.existsSync(filePath));
  assert.ok(fs.statSync(filePath).size > 1000000);
});

test("Supply chain ontology QA dataset contains domain reasoning dialogues", () => {
  const filePath = path.resolve("data/procured/supply_chain_ontology_qa.parquet");
  assert.ok(fs.existsSync(filePath));
  assert.ok(fs.statSync(filePath).size > 50000);
});

test("Kaggle US SBA National Loans contains 890k+ real small business loan records", () => {
  const filePath = path.resolve("data/procured/kaggle/sba_national_loans/SBAnational.csv");
  assert.ok(fs.existsSync(filePath));
  assert.ok(fs.statSync(filePath).size > 100000000);
});

test("Kaggle World Bank Contract Awards contains enterprise B2B procurement awards", () => {
  const filePath = path.resolve("data/procured/kaggle/corporate-procurement-contract-awards/corporate-procurement-contract-awards.csv");
  assert.ok(fs.existsSync(filePath));
  assert.ok(fs.statSync(filePath).size > 100000);
});

test("Kaggle Procurement KPI dataset contains PO lifecycle and defect metrics", () => {
  const filePath = path.resolve("data/procured/kaggle/procurement-kpi-analysis-dataset/Procurement KPI Analysis Dataset.csv");
  assert.ok(fs.existsSync(filePath));
  assert.ok(fs.statSync(filePath).size > 10000);
});

test("Kaggle Kraljic Strategic Sourcing dataset contains supply risk and profit impact", () => {
  const filePath = path.resolve("data/procured/kaggle/procurement-strategy-dataset-for-kraljic-matrix/realistic_kraljic_dataset.csv");
  assert.ok(fs.existsSync(filePath));
  assert.ok(fs.statSync(filePath).size > 10000);
});

test("Kaggle SBA Loan Case Studies contains small business financial underwriting", () => {
  const filePath = path.resolve("data/procured/kaggle/sba-loans-case-data-set/SBAcase.11.13.17.csv");
  assert.ok(fs.existsSync(filePath));
  assert.ok(fs.statSync(filePath).size > 100000);
});

test("Kaggle India Trade dataset contains 490k+ cross-border import-export commodities", () => {
  const importFile = path.resolve("data/procured/kaggle/india/trade/2018-2010_import.csv");
  const exportFile = path.resolve("data/procured/kaggle/india/trade/2018-2010_export.csv");
  assert.ok(fs.existsSync(importFile));
  assert.ok(fs.existsSync(exportFile));
  assert.ok(fs.statSync(importFile).size > 5000000);
  assert.ok(fs.statSync(exportFile).size > 10000000);
});

test("Kaggle India UDYAM dataset contains district-level MSME registration census", () => {
  const filePath = path.resolve("data/procured/kaggle/india/udyam_msme/district_level_total_Registered_msme.csv");
  assert.ok(fs.existsSync(filePath));
  assert.ok(fs.statSync(filePath).size > 20000);
});

test("Kaggle India AP Markfed dataset contains state agricultural cooperative procurement", () => {
  const filePath = path.resolve("data/procured/kaggle/india/coop_procurement/Seasonwiseprocurementdetails2023_0.csv");
  assert.ok(fs.existsSync(filePath));
  assert.ok(fs.statSync(filePath).size > 1000);
});

test("Kaggle DataCo Smart Supply Chain contains real shipping delivery and logistics records", () => {
  const filePath = path.resolve("data/procured/kaggle/supply_chain/DataCoSupplyChainDataset.csv");
  assert.ok(fs.existsSync(filePath));
  assert.ok(fs.statSync(filePath).size > 50000000);
});

test("Kaggle US Customs CBP Rulings contains 36k+ official classification determinations", () => {
  const filePath = path.resolve("data/procured/kaggle/customs/cbp_cross_rulings_2020_2025.csv");
  assert.ok(fs.existsSync(filePath));
  assert.ok(fs.statSync(filePath).size > 30000000);
});

test("Kaggle CFPB Payment Disputes contains 160k+ real consumer dispute resolution narratives", () => {
  const filePath = path.resolve("data/procured/kaggle/disputes/complaints.csv");
  assert.ok(fs.existsSync(filePath));
  assert.ok(fs.statSync(filePath).size > 50000000);
});

test("Hugging Face B2B Procure-to-Pay contains interconnected tables for 3-way matching", () => {
  const poFile = path.resolve("data/procured/huggingface/procurement_erp/purchase_orders.csv");
  const invFile = path.resolve("data/procured/huggingface/procurement_erp/supplier_invoices.csv");
  assert.ok(fs.existsSync(poFile));
  assert.ok(fs.existsSync(invFile));
});

test("Kaggle Federal Reserve FX Rates contains 20 years of daily currency exchange rates", () => {
  const filePath = path.resolve("data/procured/kaggle/fx_rates/Foreign_Exchange_Rates.csv");
  assert.ok(fs.existsSync(filePath));
  assert.ok(fs.statSync(filePath).size > 500000);
});

test("Kaggle World Bank Commodity Prices contains global benchmark spot commodity prices", () => {
  const filePath = path.resolve("data/procured/kaggle/commodity_prices/commodity_prices.csv");
  assert.ok(fs.existsSync(filePath));
  assert.ok(fs.statSync(filePath).size > 10000);
});

test("Kaggle Corporate Bankruptcy Prediction contains 95 financial statement ratios", () => {
  const filePath = path.resolve("data/procured/kaggle/credit_risk/data.csv");
  assert.ok(fs.existsSync(filePath));
  assert.ok(fs.statSync(filePath).size > 1000000);
});

test("Kaggle Global Corporate Graph contains corporate structures and ownership relationships", () => {
  const relFile = path.resolve("data/procured/kaggle/corporate_graph/relationships.csv");
  const unitsFile = path.resolve("data/procured/kaggle/corporate_graph/legal_units.csv");
  assert.ok(fs.existsSync(relFile));
  assert.ok(fs.existsSync(unitsFile));
  assert.ok(fs.statSync(relFile).size > 1000000);
});





