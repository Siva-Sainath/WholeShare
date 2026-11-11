// Generates the two story document kits: an invoice PDF and an inventory CSV for each business. The damage photos are real photographs.
// The documents are synthetic samples. Run: node scripts/generate-nyc-kits.js
import puppeteer from "puppeteer";
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";

const OUT = "src/web/public/demo-kits";
mkdirSync(OUT, { recursive: true });

const KITS = [
  {
    slug: "neon-dumpling",
    id: "sme_neon_dumpling",
    business: "Neon Dumpling Co.",
    address: ["218 Bedford Avenue", "Brooklyn, NY 11211", "United States"],
    contact: "accounts@neondumpling.example",
    industry: "RESTAURANT",
    vendor: { name: "Garden State Paper & Packaging", address: ["1450 Raritan Center Parkway", "Edison, NJ 08837"] },
    invoiceNumber: "GSP-2026-04417",
    date: "2026-11-02",
    terms: "Net 15",
    tracking: "1ZGSP0442026110217",
    lines: [
      { sku: "KRAFT-32-LID", description: "Kraft takeout container 32 oz with lid, case of 150", qty: 12, unit: "case", price: 31.5 },
      { sku: "PET-16-CUP", description: "Clear PET cup 16 oz with dome lid, case of 1,000", qty: 10, unit: "case", price: 58.0 },
      { sku: "NIT-GLV-L", description: "Nitrile gloves powder free large, case of 1,000", qty: 4, unit: "case", price: 64.0 }
    ],
    freight: 48.0,
    inventory: [
      ["Kraft takeout container 32 oz with lid", "Garden State Paper & Packaging", "case of 150", 6, 5, 12, 31.5],
      ["Clear PET cup 16 oz with dome lid", "Garden State Paper & Packaging", "case of 1,000", 3, 2, 10, 58.0],
      ["Nitrile gloves powder free large", "Garden State Paper & Packaging", "case of 1,000", 1, 1, 4, 64.0],
      ["Jasmine rice", "Queens Foodservice Distributors", "25 lb bag", 8, 6, 20, 29.4],
      ["Soybean cooking oil", "Queens Foodservice Distributors", "35 lb jug", 2, 2, 6, 48.2]
    ],
    sku: "kraft-takeout-container-32oz-lid",
    mainQty: 12,
    mainPrice: 31.5
  },
  {
    slug: "cloud-nine-boba",
    id: "sme_cloud_nine_boba",
    business: "Cloud Nine Boba",
    address: ["77 Court Street", "Brooklyn, NY 11201", "United States"],
    contact: "orders@cloudnineboba.example",
    industry: "FOOD_AND_BEVERAGE",
    vendor: { name: "Brooklyn Cup & Lid Co.", address: ["40 Morgan Avenue, Building 3", "Brooklyn, NY 11205"] },
    invoiceNumber: "BCL-88213",
    date: "2026-11-03",
    terms: "Net 15",
    tracking: "1ZBCL0882026110301",
    lines: [
      { sku: "PET-16-CUP", description: "Clear PET cup 16 oz with dome lid, case of 1,000", qty: 30, unit: "case", price: 58.0 },
      { sku: "STRAW-BOBA", description: "Wide boba straw, individually wrapped, case of 2,000", qty: 8, unit: "case", price: 41.0 },
      { sku: "KRAFT-32-LID", description: "Kraft takeout container 32 oz with lid, case of 150", qty: 6, unit: "case", price: 31.5 }
    ],
    freight: 36.0,
    inventory: [
      ["Clear PET cup 16 oz with dome lid", "Brooklyn Cup & Lid Co.", "case of 1,000", 9, 7, 30, 58.0],
      ["Wide boba straw", "Brooklyn Cup & Lid Co.", "case of 2,000", 2, 2, 8, 41.0],
      ["Kraft takeout container 32 oz with lid", "Brooklyn Cup & Lid Co.", "case of 150", 3, 2, 6, 31.5],
      ["Tapioca pearls", "Queens Foodservice Distributors", "6 kg bag", 5, 4, 12, 22.5]
    ],
    sku: "clear-pet-cup-16oz",
    mainQty: 30,
    mainPrice: 58.0
  }
];

// Real, openly licensed photographs (credits in demo-kits/photos/CREDITS.json). Nothing is drawn.
const DAMAGE_PHOTO = { sme_neon_dumpling: "/demo-kits/photos/damaged-parcel-crushed.jpg", sme_cloud_nine_boba: "/demo-kits/photos/damaged-parcel-torn.jpg" };
const money = (n) => `$${n.toFixed(2)}`;
const lineTotal = (l) => l.qty * l.price;

function invoiceHtml(k) {
  const sub = k.lines.reduce((s, l) => s + lineTotal(l), 0);
  const total = sub + k.freight;
  return `<!doctype html><html><head><meta charset="utf-8"><style>
  body{font:13px/1.5 Helvetica,Arial,sans-serif;color:#0F1F2E;margin:48px}
  h1{font-size:26px;margin:0 0 4px} .muted{color:#5C6A79} .row{display:flex;justify-content:space-between;gap:32px}
  table{width:100%;border-collapse:collapse;margin-top:24px} th{text-align:left;border-bottom:2px solid #0F1F2E;padding:8px 6px;font-size:11px;text-transform:uppercase;letter-spacing:.06em}
  td{padding:10px 6px;border-bottom:1px solid #E7E2D8} td.n,th.n{text-align:right} .tot td{border:0;padding:4px 6px}
  .box{margin-top:20px;padding:12px 14px;background:#F4EFEB;border-radius:8px}
  </style></head><body>
  <div class="row"><div><h1>${k.vendor.name}</h1><div class="muted">${k.vendor.address.join("<br>")}</div></div>
  <div style="text-align:right"><h1 style="font-size:20px">INVOICE</h1>Invoice number: ${k.invoiceNumber}<br>Invoice date: ${k.date}<br>Payment terms: ${k.terms}</div></div>
  <div class="row" style="margin-top:28px"><div><strong>BILLED TO</strong><br>${k.business}<br>${k.address.join("<br>")}<br>${k.contact}</div>
  <div><strong>SHIPMENT</strong><br>Carrier: UPS Ground<br>Tracking number: ${k.tracking}</div></div>
  <table><tr><th>Item code</th><th>Description</th><th class="n">Quantity</th><th>Unit</th><th class="n">Unit price</th><th class="n">Amount</th></tr>
  ${k.lines.map((l) => `<tr><td>${l.sku}</td><td>${l.description}</td><td class="n">${l.qty}</td><td>${l.unit}</td><td class="n">${money(l.price)}</td><td class="n">${money(lineTotal(l))}</td></tr>`).join("")}
  </table>
  <table class="tot" style="width:320px;margin-left:auto"><tr><td>Subtotal</td><td class="n">${money(sub)}</td></tr><tr><td>Freight</td><td class="n">${money(k.freight)}</td></tr><tr><td>Sales tax (resale exempt)</td><td class="n">$0.00</td></tr><tr><td><strong>Total due</strong></td><td class="n"><strong>${money(total)}</strong></td></tr></table>
  <div class="box muted">Sample document created for the WholeShare demo. It is not a real invoice.</div></body></html>`;
}

const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox"] });
const manifestPath = `${OUT}/demo-kits-manifest.json`;
const manifest = JSON.parse(readFileSync(manifestPath, "utf8")).filter((entry) => !KITS.some((k) => k.id === entry.id));

for (const k of KITS) {
  const page = await browser.newPage();
  await page.setContent(invoiceHtml(k), { waitUntil: "load" });
  await page.pdf({ path: `${OUT}/${k.slug}-invoice.pdf`, format: "Letter", printBackground: true });
  await page.close();
  const header = "Item,Supplier,Unit,On hand,Weekly use,Reorder quantity,Unit cost USD";
  const rows = k.inventory.map((row) => row.map((cell) => (String(cell).includes(",") ? `"${cell}"` : cell)).join(","));
  writeFileSync(`${OUT}/${k.slug}-inventory.csv`, [header, ...rows].join("\n") + "\n");
  manifest.unshift({ id: k.id, name: k.business, country: "US", currency: "USD", industry: k.industry, invoicePdf: `/demo-kits/${k.slug}-invoice.pdf`, inventoryCsv: `/demo-kits/${k.slug}-inventory.csv`, damageProofPng: DAMAGE_PHOTO[k.id], sku: k.sku, overpricedRate: k.mainPrice, wholeShareRate: Math.round(k.mainPrice * 0.74 * 100) / 100, qty: k.mainQty, trackingNumber: k.tracking });
}
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
await browser.close();
console.log("kits written:", KITS.map((k) => k.slug).join(", "));
