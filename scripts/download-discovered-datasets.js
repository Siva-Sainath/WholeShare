import fs from 'node:fs';
import path from 'node:path';

const TARGET_DIR = path.resolve('data/procured/syndicate_spec');
if (!fs.existsSync(TARGET_DIR)) {
  fs.mkdirSync(TARGET_DIR, { recursive: true });
}

const DATASETS_TO_FETCH = [
  {
    name: 'olist_order_payments.csv',
    url: 'https://huggingface.co/datasets/aviahYadler/Olist_Ecommerce_Dataset/resolve/main/olist_order_payments_dataset.csv',
    aspect: 'escrow'
  },
  {
    name: 'olist_orders_lifecycle.csv',
    url: 'https://huggingface.co/datasets/aviahYadler/Olist_Ecommerce_Dataset/resolve/main/olist_orders_dataset.csv',
    aspect: 'escrow'
  },
  {
    name: 'olist_order_items_settlement.csv',
    url: 'https://huggingface.co/datasets/aviahYadler/Olist_Ecommerce_Dataset/resolve/main/olist_order_items_dataset.csv',
    aspect: 'escrow'
  },
  {
    name: 'olist_delivery_dispute_reviews.csv',
    url: 'https://huggingface.co/datasets/miminmoons/olist-ecommerce-for-delivery-and-review-prediction/resolve/main/data/olist_order_reviews_dataset.csv',
    aspect: 'tracking_disputes'
  },
  {
    name: 'bargaining_conversational_pricing.csv',
    url: 'https://huggingface.co/datasets/ANASAKHTAR/bargaining_conversational_dataset.csv/resolve/main/bargaining_conversational_dataset.csv',
    aspect: 'sourcing_negotiation'
  },
  {
    name: 'cleanlab_property_damage_claims.csv',
    url: 'https://huggingface.co/datasets/Cleanlab/insurance-claims-extraction/resolve/main/insurance_claims_extraction.csv',
    aspect: 'tracking_disputes'
  }
];

async function downloadFile(item) {
  const dest = path.join(TARGET_DIR, item.name);
  if (fs.existsSync(dest) && fs.statSync(dest).size > 1000) {
    console.log(`[CACHED] ${item.name} already exists (${fs.statSync(dest).size} bytes).`);
    return;
  }

  console.log(`[FETCHING] ${item.name} from ${item.url}...`);
  try {
    const res = await fetch(item.url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; WholeshareProcurement/1.0)' },
      redirect: 'follow'
    });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    }
    const buffer = await res.arrayBuffer();
    fs.writeFileSync(dest, Buffer.from(buffer));
    console.log(`[SAVED] ${item.name} (${buffer.byteLength} bytes).`);
  } catch (err) {
    console.error(`[ERROR] Failed to download ${item.name}: ${err.message}`);
  }
}

async function main() {
  for (const item of DATASETS_TO_FETCH) {
    await downloadFile(item);
  }
}

main();

