import { writeFileSync, existsSync, mkdirSync, statSync } from "node:fs";
import { resolve, join } from "node:path";

const DATASETS = [
  {
    name: "global_procurement_ted_sample.csv",
    url: "https://huggingface.co/datasets/zalizedata/global-public-procurement-ted-ocds-dataset/raw/main/samples/global-public-procurement-ted-ocds-dataset-sample.csv",
    category: "Wholesale MOQ Tier Pricing"
  },
  {
    name: "northwind_order_details.csv",
    url: "https://raw.githubusercontent.com/graphql-compose/graphql-compose-examples/master/examples/northwind/data/csv/order_details.csv",
    category: "Wholesale MOQ Tier Pricing"
  },
  {
    name: "northwind_products.csv",
    url: "https://raw.githubusercontent.com/graphql-compose/graphql-compose-examples/master/examples/northwind/data/csv/products.csv",
    category: "Wholesale MOQ Tier Pricing"
  },
  {
    name: "freight_damage_claims_sample.csv",
    url: "https://raw.githubusercontent.com/Oseko-del/damage-claims-verification/main/dataset/sample_claims.csv",
    category: "Freight Damage and Dispute Evidence"
  },
  {
    name: "accident_insurance_claims.csv",
    url: "https://huggingface.co/datasets/Narayana02/Accident-data/raw/main/insurance_claims.csv",
    category: "Freight Damage and Dispute Evidence"
  },
  {
    name: "craigslist_bargains_train.csv",
    url: "https://huggingface.co/datasets/aladar/craigslist_bargains/raw/main/train.csv",
    category: "Multi-Agent Negotiation Dialogues"
  },
  {
    name: "deal_or_no_deal_train.txt",
    url: "https://raw.githubusercontent.com/facebookresearch/end-to-end-negotiator/master/src/data/negotiate/train.txt",
    category: "Multi-Agent Negotiation Dialogues"
  },
  {
    name: "fedex_tracking_events.json",
    url: "https://raw.githubusercontent.com/parikshithmp2/shipment_tracking/main/shipment_data.json",
    category: "Carrier Shipment Tracking Events"
  },
  {
    name: "fedex_tracking_summary.csv",
    url: "https://raw.githubusercontent.com/parikshithmp2/shipment_tracking/main/flattened_shipments.csv",
    category: "Carrier Shipment Tracking Events"
  },
  {
    name: "smart_logistics_events.csv",
    url: "https://raw.githubusercontent.com/santhosh87-cpu/Smart-Logistics-Supply-Chain-/main/Smart%20Logistics%20Supply%20Chain%20Dataset.csv",
    category: "Carrier Shipment Tracking Events"
  },
  {
    name: "ar_aging_query1.csv",
    url: "https://raw.githubusercontent.com/ZhePeng02/ar-aging-analysis/main/query1_aging.csv",
    category: "SME Receivables and Invoicing"
  },
  {
    name: "enterprise_ar_invoices.csv",
    url: "https://raw.githubusercontent.com/tjamali/accounts-receivable-analysis/main/dataset.csv",
    category: "SME Receivables and Invoicing"
  }
];

const COMMODITY_TIERS = {
  version: "1.0.0",
  description: "Wholeshare verified commodity MOQ discount curves",
  commodities: [
    {
      commodityId: "FLOUR_ORGANIC_50LB",
      name: "Organic Artisan Bakery Flour (50 lb sack)",
      unit: "sack",
      standardRetailPriceCents: 3400,
      tiers: [
        { minQuantity: 1, maxQuantity: 49, unitPriceCents: 3400, discountPercent: 0 },
        { minQuantity: 50, maxQuantity: 199, unitPriceCents: 2950, discountPercent: 13.24 },
        { minQuantity: 200, maxQuantity: 499, unitPriceCents: 2620, discountPercent: 22.94 },
        { minQuantity: 500, maxQuantity: null, unitPriceCents: 2480, discountPercent: 27.06 }
      ]
    },
    {
      commodityId: "MALT_2ROW_55LB",
      name: "Craft Brewing 2-Row Pale Malt (55 lb bag)",
      unit: "bag",
      standardRetailPriceCents: 4800,
      tiers: [
        { minQuantity: 1, maxQuantity: 19, unitPriceCents: 4800, discountPercent: 0 },
        { minQuantity: 20, maxQuantity: 99, unitPriceCents: 3950, discountPercent: 17.71 },
        { minQuantity: 100, maxQuantity: null, unitPriceCents: 3200, discountPercent: 33.33 }
      ]
    },
    {
      commodityId: "PCBA_FR4_4LAYER",
      name: "Electronics PCBA (FR4 4-Layer High Spec)",
      unit: "board",
      standardRetailPriceCents: 1450,
      tiers: [
        { minQuantity: 10, maxQuantity: 99, unitPriceCents: 1450, discountPercent: 0 },
        { minQuantity: 100, maxQuantity: 499, unitPriceCents: 780, discountPercent: 46.21 },
        { minQuantity: 500, maxQuantity: 999, unitPriceCents: 420, discountPercent: 71.03 },
        { minQuantity: 1000, maxQuantity: null, unitPriceCents: 295, discountPercent: 79.66 }
      ]
    },
    {
      commodityId: "PACKAGING_ECT32",
      name: "Corrugated Packaging (ECT-32 Heavy Shipping Box)",
      unit: "carton",
      standardRetailPriceCents: 210,
      tiers: [
        { minQuantity: 100, maxQuantity: 499, unitPriceCents: 210, discountPercent: 0 },
        { minQuantity: 500, maxQuantity: 999, unitPriceCents: 145, discountPercent: 30.95 },
        { minQuantity: 1000, maxQuantity: null, unitPriceCents: 98, discountPercent: 53.33 }
      ]
    }
  ]
};

async function downloadDataset(item, targetDir) {
  const filePath = join(targetDir, item.name);
  if (existsSync(filePath) && statSync(filePath).size > 1000) {
    const size = statSync(filePath).size;
    console.log(`[CACHED] ${item.name} (${size} bytes)`);
    return { name: item.name, status: "CACHED", size };
  }

  console.log(`Downloading ${item.name} from ${item.url}...`);
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 60000);

  try {
    const res = await fetch(item.url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Wholeshare-Procurement-Agent/1.0"
      }
    });

    clearTimeout(timeoutId);

    if (!res.ok) {
      throw new Error(`HTTP ${res.status} ${res.statusText}`);
    }

    const buffer = Buffer.from(await res.arrayBuffer());
    if (buffer.length < 100) {
      throw new Error(`File too small (${buffer.length} bytes)`);
    }

    writeFileSync(filePath, buffer);
    console.log(`[DONE] ${item.name} (${buffer.length} bytes)`);
    return { name: item.name, status: "DOWNLOADED", size: buffer.length };
  } catch (err) {
    clearTimeout(timeoutId);
    console.error(`[FAIL] ${item.name}: ${err.message}`);
    throw err;
  }
}

async function main() {
  const targetDir = resolve(process.cwd(), "data/procured/syndicate_spec");
  mkdirSync(targetDir, { recursive: true });

  const commodityPath = join(targetDir, "commodity_moq_tiers.json");
  writeFileSync(commodityPath, JSON.stringify(COMMODITY_TIERS, null, 2));
  console.log(`[CREATED] commodity_moq_tiers.json`);

  const results = [];
  for (const item of DATASETS) {
    const res = await downloadDataset(item, targetDir);
    results.push(res);
  }

  const manifestPath = join(targetDir, "manifest.json");
  const manifest = {
    generatedAt: new Date().toISOString(),
    specification: "SYNDICATE_SPEC.pdf",
    categoriesCount: 5,
    files: results
  };
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  console.log(`\nProcurement complete. Manifest written to ${manifestPath}.`);
}

main().catch(err => {
  console.error("Procurement failed:", err.message);
  process.exit(1);
});

