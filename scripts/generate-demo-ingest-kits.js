#!/usr/bin/env node

import { writeFileSync, existsSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import puppeteer from "puppeteer";

const DEMO_DIR = resolve(process.cwd(), "src/web/public/demo-kits");
const PUBLIC_ALIAS_DIR = resolve(process.cwd(), "public/demo-kits");

[DEMO_DIR, PUBLIC_ALIAS_DIR].forEach(dir => {
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
});

export const DEMO_PERSONAS = [
  {
    id: "sme_de_bakery",
    slug: "berlin-bakery",
    companyName: "Berlin Artisan Patisserie GmbH",
    country: "DE",
    currency: "EUR",
    industry: "FOOD_AND_BEVERAGE",
    distributor: "Bavaria Foodservice Wholesale GmbH",
    sku: "sku-food_and_beverage-de-flour",
    skuDesc: "German Organic Type 550 Artisan Wheat Flour (25kg Sack)",
    overpricedRate: 34.50,
    wholeShareRate: 23.80,
    qty: 120,
    trackingNumber: "UPS-1Z88291048821049",
    carrier: "UPS Freight",
    hsCode: "110100"
  },
  {
    id: "sme_us_coffee",
    slug: "austin-roasters",
    companyName: "Austin Craft Coffee Roasters LLC",
    country: "US",
    currency: "USD",
    industry: "FOOD_AND_BEVERAGE",
    distributor: "Lone Star Specialty Importers Inc",
    sku: "sku-food_and_beverage-us-coffee",
    skuDesc: "Ethiopian Yirgacheffe Grade 1 Green Coffee (60kg Bag)",
    overpricedRate: 480.00,
    wholeShareRate: 330.00,
    qty: 25,
    trackingNumber: "FDX-774910284712",
    carrier: "FedEx Freight",
    hsCode: "090111"
  },
  {
    id: "sme_cn_smt",
    slug: "shenzhen-smt",
    companyName: "Shenzhen Precision SMT Assembly Co",
    country: "CN",
    currency: "CNH",
    industry: "PCB_MICROELECTRONICS",
    distributor: "Guangdong Microelectronics Trade Ltd",
    sku: "sku-pcb_microelectronics-cn-pcb",
    skuDesc: "High-Density Multi-Layer PCB Test Panels (500ct Reel)",
    overpricedRate: 2850.00,
    wholeShareRate: 1980.00,
    qty: 40,
    trackingNumber: "SF-991823719284",
    carrier: "SF Express International",
    hsCode: "853400"
  },
  {
    id: "sme_gb_packaging",
    slug: "london-packaging",
    companyName: "London Sustainable Retail Packs Ltd",
    country: "GB",
    currency: "GBP",
    industry: "ECO_PACKAGING",
    distributor: "Thames Industrial Corrugated Supplies",
    sku: "sku-eco_packaging-gb-carton",
    skuDesc: "Biodegradable Double-Wall Kraft Shipping Cartons (100ct)",
    overpricedRate: 95.00,
    wholeShareRate: 64.00,
    qty: 80,
    trackingNumber: "DPD-662910482918",
    carrier: "DPD Air Cargo",
    hsCode: "481910"
  },
  {
    id: "sme_jp_ceramics",
    slug: "tokyo-ceramics",
    companyName: "Tokyo Heritage Ceramic Studio",
    country: "JP",
    currency: "JPY",
    industry: "ARTISAN_CERAMICS",
    distributor: "Kanto Raw Ceramic Minerals Co",
    sku: "sku-artisan_ceramics-jp-porcelain",
    skuDesc: "Fine Shigaraki Porcelain Clay Slabs (20kg Block)",
    overpricedRate: 6500,
    wholeShareRate: 4200,
    qty: 50,
    trackingNumber: "YMT-441928374918",
    carrier: "Yamato Transport",
    hsCode: "690100"
  },
  {
    id: "sme_in_textiles",
    slug: "mumbai-textiles",
    companyName: "Mumbai Organic Weaving Works",
    country: "IN",
    currency: "INR",
    industry: "APPAREL_TEXTILES",
    distributor: "Maharashtra Cotton Syndicate",
    sku: "sku-apparel_textiles-in-cotton",
    skuDesc: "Combed Long-Staple Organic Cotton Spools (50kg Bale)",
    overpricedRate: 18500,
    wholeShareRate: 12200,
    qty: 30,
    trackingNumber: "BLD-991827364512",
    carrier: "Blue Dart Express",
    hsCode: "520512"
  },
  {
    id: "sme_it_dental",
    slug: "milan-medical",
    companyName: "Milan Precision Ortho & Dental Care",
    country: "IT",
    currency: "EUR",
    industry: "MEDICAL_DENTAL",
    distributor: "Lombardia MedTech Supplies SpA",
    sku: "sku-medical_dental-it-scaler",
    skuDesc: "Autoclavable Surgical Stainless Scaler Sets (10ct Tray)",
    overpricedRate: 420.00,
    wholeShareRate: 285.00,
    qty: 20,
    trackingNumber: "DHL-992817263544",
    carrier: "DHL Express Medical",
    hsCode: "901849"
  },
  {
    id: "sme_br_solar",
    slug: "saopaulo-solar",
    companyName: "São Paulo Commercial Clean Energy",
    country: "BR",
    currency: "BRL",
    industry: "COMMERCIAL_SOLAR",
    distributor: "Paulista Photovoltaic Distributors",
    sku: "sku-commercial_solar-br-photovoltaic",
    skuDesc: "Monocrystalline 550W Tier-1 Solar Panels (Pallet of 30)",
    overpricedRate: 7200.00,
    wholeShareRate: 4950.00,
    qty: 15,
    trackingNumber: "JAD-119283746501",
    carrier: "Jadlog Logística",
    hsCode: "854143"
  },
  {
    id: "sme_ca_hydro",
    slug: "toronto-hydroponics",
    companyName: "Toronto CEA Indoor Greens Inc",
    country: "CA",
    currency: "CAD",
    industry: "AGRICULTURAL_INPUTS",
    distributor: "Ontario Horticultural Matrix Supplies",
    sku: "sku-agricultural_inputs-ca-perlite",
    skuDesc: "Horticultural Expanded Coarse Perlite (100L Bag)",
    overpricedRate: 48.00,
    wholeShareRate: 31.50,
    qty: 100,
    trackingNumber: "CAN-992837461928",
    carrier: "Canada Post Commercial",
    hsCode: "680620"
  },
  {
    id: "sme_sg_coldchain",
    slug: "singapore-coldchain",
    companyName: "Changi BioLogistics Pte Ltd",
    country: "SG",
    currency: "SGD",
    industry: "COLD_CHAIN",
    distributor: "Malacca Straits Cold Storage Equipment",
    sku: "sku-cold_chain-sg-pallet",
    skuDesc: "Vacuum-Insulated Chilled Temperature Totes (50L PCM)",
    overpricedRate: 380.00,
    wholeShareRate: 255.00,
    qty: 25,
    trackingNumber: "SIN-881928374619",
    carrier: "SingPost Speedpost",
    hsCode: "392310"
  },
  {
    id: "sme_fr_restaurant",
    slug: "lyon-restaurant",
    companyName: "Lyon Gastronomy & Bistro Group",
    country: "FR",
    currency: "EUR",
    industry: "RESTAURANT_EQUIPMENT",
    distributor: "Rhone Commercial Kitchen Warehouses",
    sku: "sku-restaurant_equipment-fr-grinder",
    skuDesc: "Commercial Precision Conical Burr Coffee Grinders",
    overpricedRate: 850.00,
    wholeShareRate: 590.00,
    qty: 10,
    trackingNumber: "CHR-771928374615",
    carrier: "Chronopost France",
    hsCode: "843880"
  },
  {
    id: "sme_ae_hospitality",
    slug: "dubai-hospitality",
    companyName: "Emirates Royal Suites Hotel Management",
    country: "AE",
    currency: "AED",
    industry: "HOSPITALITY_SUPPLIES",
    distributor: "Gulf Commercial Linen & Amenities FZ",
    sku: "sku-hospitality_supplies-ae-linens",
    skuDesc: "800-Thread-Count Egyptian Cotton Hotel Bed Linens Set",
    overpricedRate: 620.00,
    wholeShareRate: 410.00,
    qty: 60,
    trackingNumber: "ARX-551928374619",
    carrier: "Aramex Freight",
    hsCode: "630231"
  }
];

function generateHtmlInvoice(persona) {
  const subtotal = persona.overpricedRate * persona.qty;
  const tax = Math.round(subtotal * 0.08 * 100) / 100;
  const shipping = 150.00;
  const total = subtotal + tax + shipping;
  const savingsAmount = (persona.overpricedRate - persona.wholeShareRate) * persona.qty;
  const savingsPct = Math.round(((persona.overpricedRate - persona.wholeShareRate) / persona.overpricedRate) * 100);

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; margin: 40px; color: #1e293b; background: #ffffff; }
  .header { display: flex; justify-content: space-between; border-bottom: 2px solid #0f172a; padding-bottom: 20px; }
  .logo-title { font-size: 24px; font-weight: 800; color: #0f172a; }
  .meta-col { text-align: right; font-size: 13px; line-height: 1.5; }
  .bill-to { margin: 30px 0; display: flex; justify-content: space-between; font-size: 13px; line-height: 1.6; }
  table { width: 100%; border-collapse: collapse; margin: 25px 0; font-size: 13px; }
  th { background: #f8fafc; text-align: left; padding: 10px 12px; border-bottom: 2px solid #cbd5e1; font-weight: 600; }
  td { padding: 12px; border-bottom: 1px solid #e2e8f0; }
  .num { text-align: right; font-variant-numeric: tabular-nums; }
  .totals { margin-left: auto; width: 320px; font-size: 13px; }
  .totals-row { display: flex; justify-content: space-between; padding: 6px 0; }
  .grand-total { border-top: 2px solid #0f172a; font-weight: 700; font-size: 15px; padding-top: 10px; margin-top: 6px; }
  .footer-notice { margin-top: 40px; padding: 14px; background: #f1f5f9; border-radius: 6px; font-size: 11.5px; color: #475569; }
  .tag { display: inline-block; padding: 3px 6px; background: #e0f2fe; color: #0369a1; border-radius: 4px; font-size: 10.5px; font-weight: 600; }
</style>
</head>
<body>
  <div class="header">
    <div>
      <div class="logo-title">${persona.distributor}</div>
      <div style="font-size: 12px; color: #64748b; margin-top: 4px;">Commercial Wholesale &amp; Logistics Gateway</div>
    </div>
    <div class="meta-col">
      <div style="font-size: 16px; font-weight: 700; color: #0f172a;">COMMERCIAL INVOICE</div>
      <div><strong>Invoice #:</strong> INV-${persona.slug.toUpperCase()}-2026-991</div>
      <div><strong>Date:</strong> 2026-11-04</div>
      <div><strong>Payment Terms:</strong> NET 30 DAYS</div>
    </div>
  </div>

  <div class="bill-to">
    <div>
      <strong style="color: #64748b; text-transform: uppercase; font-size: 11px;">Billed To Customer:</strong>
      <div style="font-size: 15px; font-weight: 700; color: #0f172a; margin-top: 4px;">${persona.companyName}</div>
      <div>Commercial Account: <code>${persona.id}</code></div>
      <div>Jurisdiction: ${persona.country} &bull; Sector: ${persona.industry}</div>
    </div>
    <div>
      <strong style="color: #64748b; text-transform: uppercase; font-size: 11px;">Logistics &amp; Tracking Manifest:</strong>
      <div style="margin-top: 4px;">Carrier: <strong>${persona.carrier}</strong></div>
      <div>Tracking ID: <code>${persona.trackingNumber}</code></div>
      <div>Bill of Lading: <strong>BOL-WS-${persona.slug.slice(0, 4).toUpperCase()}-88192</strong></div>
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th>Line Item Description</th>
        <th>HS6 Code</th>
        <th class="num">Quantity</th>
        <th class="num">Contract Rate (${persona.currency})</th>
        <th class="num">Extended Amount (${persona.currency})</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td>
          <div style="font-weight: 600;">${persona.skuDesc}</div>
          <div style="font-size: 11px; color: #64748b;">Canonical Sourcing SKU: <code>${persona.sku}</code></div>
        </td>
        <td><span class="tag">HS ${persona.hsCode}</span></td>
        <td class="num">${persona.qty}</td>
        <td class="num">${persona.overpricedRate.toFixed(2)}</td>
        <td class="num">${subtotal.toFixed(2)}</td>
      </tr>
    </tbody>
  </table>

  <div class="totals">
    <div class="totals-row"><span>Subtotal:</span><span class="num">${subtotal.toFixed(2)} ${persona.currency}</span></div>
    <div class="totals-row"><span>Jurisdiction Tax (8%):</span><span class="num">${tax.toFixed(2)} ${persona.currency}</span></div>
    <div class="totals-row"><span>Freight Handling:</span><span class="num">${shipping.toFixed(2)} ${persona.currency}</span></div>
    <div class="totals-row grand-total"><span>Total Amount Due:</span><span class="num">${total.toFixed(2)} ${persona.currency}</span></div>
  </div>

  <div class="footer-notice">
    <strong>Procurement Audit Benchmarking Notice:</strong><br>
    WholeShare Autonomous Escrow pricing analysis: Standard distributor spot price for this SKU is ${persona.overpricedRate.toFixed(2)} ${persona.currency}. Joining a Tier-2 WholeShare Clan unlocks ${persona.wholeShareRate.toFixed(2)} ${persona.currency} per unit, saving <strong>${savingsAmount.toFixed(2)} ${persona.currency} (${savingsPct}% wholesale discount)</strong> with zero counterparty default risk on PayPal for Business.
  </div>
</body>
</html>`;
}

function generateCsvInventory(persona) {
  const currentStock = Math.floor(persona.qty * 0.25);
  const reorderThreshold = Math.floor(persona.qty * 0.40);
  const reorderQty = persona.qty;
  return `SKU,Item Name,Category,Current Stock Units,Reorder Threshold Units,Target Restock Units,Historical Unit Cost ${persona.currency},Canonical Supplier
${persona.sku},"${persona.skuDesc}",${persona.industry},${currentStock},${reorderThreshold},${reorderQty},${persona.overpricedRate.toFixed(2)},"${persona.distributor}"
`;
}

function generateSvgDamageProof(persona) {
  return `<svg width="800" height="600" viewBox="0 0 800 600" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#1e293b"/>
      <stop offset="100%" stop-color="#0f172a"/>
    </linearGradient>
    <linearGradient id="water" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#0284c7" stop-opacity="0.8"/>
      <stop offset="100%" stop-color="#0369a1" stop-opacity="0.9"/>
    </linearGradient>
  </defs>

  <rect width="800" height="600" fill="url(#bg)"/>

  <!-- Warehouse Inspection Header Card -->
  <rect x="40" y="40" width="720" height="90" rx="8" fill="#1e293b" stroke="#334155" stroke-width="2"/>
  <text x="65" y="75" font-family="system-ui, sans-serif" font-size="20" font-weight="700" fill="#f8fafc">RECEIVING INSPECTION &amp; DAMAGE VERIFICATION PROOF</text>
  <text x="65" y="105" font-family="monospace" font-size="13" fill="#38bdf8">TRACKING ID: ${persona.trackingNumber} | BOL: BOL-WS-${persona.slug.toUpperCase()}-88192</text>

  <!-- Inspection Evidence Body -->
  <rect x="40" y="150" width="720" height="400" rx="8" fill="#0f172a" stroke="#ef4444" stroke-width="2" stroke-dasharray="6,4"/>

  <!-- Simulated Physical Sacks / Packaging with Damage Overlay -->
  <rect x="80" y="190" width="280" height="300" rx="6" fill="#334155" stroke="#475569" stroke-width="2"/>
  <rect x="380" y="190" width="280" height="300" rx="6" fill="#334155" stroke="#475569" stroke-width="2"/>

  <!-- Water Damage Intrusion Marks -->
  <path d="M 120 400 Q 180 340 240 410 T 360 420 L 360 490 L 80 490 Z" fill="url(#water)"/>
  <path d="M 400 420 Q 480 360 550 430 T 660 410 L 660 490 L 380 490 Z" fill="url(#water)"/>

  <!-- High-contrast stamp -->
  <g transform="translate(420, 230) rotate(-12)">
    <rect x="0" y="0" width="260" height="70" rx="6" fill="#7f1d1d" stroke="#ef4444" stroke-width="3"/>
    <text x="25" y="30" font-family="system-ui, sans-serif" font-size="16" font-weight="800" fill="#fef2f2">CARRIER DAMAGE VERIFIED</text>
    <text x="35" y="55" font-family="monospace" font-size="13" font-weight="600" fill="#fca5a5">10 DEFECTIVE UNITS REJECTED</text>
  </g>

  <!-- SME Identity & Packing Details -->
  <text x="65" y="530" font-family="system-ui, sans-serif" font-size="13" fill="#94a3b8">SME Receiver: <tspan fill="#f8fafc" font-weight="600">${persona.companyName}</tspan> | SKU: <tspan fill="#38bdf8">${persona.sku}</tspan></text>
</svg>`;
}

export async function generateDemoKits() {
  console.log("=== Generating Reverse Ground-Truth Multimodal Demo Kits ===");
  console.log(`Rendering 12 Personas into ${DEMO_DIR}...`);

  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"]
  });

  try {
    for (const persona of DEMO_PERSONAS) {
      console.log(`Processing demo kit: ${persona.companyName} (${persona.country})...`);

      // 1. Generate and save CSV restock sheet
      const csvContent = generateCsvInventory(persona);
      const csvPath1 = resolve(DEMO_DIR, `${persona.slug}-inventory.csv`);
      const csvPath2 = resolve(PUBLIC_ALIAS_DIR, `${persona.slug}-inventory.csv`);
      writeFileSync(csvPath1, csvContent, "utf-8");
      writeFileSync(csvPath2, csvContent, "utf-8");

      // 2. Generate and save SVG damage photo
      const svgContent = generateSvgDamageProof(persona);
      const svgPath1 = resolve(DEMO_DIR, `${persona.slug}-damage-proof.svg`);
      const svgPath2 = resolve(PUBLIC_ALIAS_DIR, `${persona.slug}-damage-proof.svg`);
      writeFileSync(svgPath1, svgContent, "utf-8");
      writeFileSync(svgPath2, svgContent, "utf-8");

      // 3. Render HTML Invoice to high-res PDF via Puppeteer
      const page = await browser.newPage();
      const invoiceHtml = generateHtmlInvoice(persona);
      await page.setContent(invoiceHtml, { waitUntil: "domcontentloaded" });

      const pdfPath1 = resolve(DEMO_DIR, `${persona.slug}-invoice.pdf`);
      const pdfPath2 = resolve(PUBLIC_ALIAS_DIR, `${persona.slug}-invoice.pdf`);
      const pdfBuffer = await page.pdf({
        format: "A4",
        printBackground: true,
        margin: { top: "20px", bottom: "20px", left: "20px", right: "20px" }
      });
      writeFileSync(pdfPath1, pdfBuffer);
      writeFileSync(pdfPath2, pdfBuffer);

      // 4. Render PNG of damage photo via Puppeteer
      await page.setViewport({ width: 800, height: 600 });
      await page.setContent(svgContent, { waitUntil: "domcontentloaded" });
      const pngPath1 = resolve(DEMO_DIR, `${persona.slug}-damage-proof.png`);
      const pngPath2 = resolve(PUBLIC_ALIAS_DIR, `${persona.slug}-damage-proof.png`);
      const screenshotBuffer = await page.screenshot({ type: "png" });
      writeFileSync(pngPath1, screenshotBuffer);
      writeFileSync(pngPath2, screenshotBuffer);

      await page.close();
    }
  } finally {
    await browser.close();
  }

  // Generate an index manifest for UI quick-loading
  const manifest = DEMO_PERSONAS.map(p => ({
    id: p.id,
    name: p.companyName,
    country: p.country,
    currency: p.currency,
    industry: p.industry,
    invoicePdf: `/demo-kits/${p.slug}-invoice.pdf`,
    inventoryCsv: `/demo-kits/${p.slug}-inventory.csv`,
    damageProofPng: `/demo-kits/${p.slug}-damage-proof.png`,
    sku: p.sku,
    overpricedRate: p.overpricedRate,
    wholeShareRate: p.wholeShareRate,
    qty: p.qty,
    trackingNumber: p.trackingNumber
  }));

  writeFileSync(resolve(DEMO_DIR, "demo-kits-manifest.json"), JSON.stringify(manifest, null, 2), "utf-8");
  writeFileSync(resolve(PUBLIC_ALIAS_DIR, "demo-kits-manifest.json"), JSON.stringify(manifest, null, 2), "utf-8");

  console.log(`[PASS] 12 Complete Multimodal Demo Kits Generated in ${DEMO_DIR}.`);
}

if (process.argv[1]?.endsWith("generate-demo-ingest-kits.js")) {
  generateDemoKits().catch(err => {
    console.error("Failed to generate demo kits:", err);
    process.exit(1);
  });
}
