import test from "node:test";
import assert from "node:assert/strict";
import { SupplierScraperKernel } from "../src/kernel/supplier-scraper.js";
import { readFileSync, existsSync } from "node:fs";

test("SupplierScraperKernel enforces strict domain allowlist boundaries", () => {
  const kernel = new SupplierScraperKernel();

  assert.equal(kernel.isDomainAllowed("https://portal.sysco.com/catalog/flour"), true);
  assert.equal(kernel.isDomainAllowed("https://order.usfoods.com/products"), true);
  assert.equal(kernel.isDomainAllowed("https://webstaurantstore.com/bakery-supplies"), true);
  assert.equal(kernel.isDomainAllowed("https://wholeshare.local/api"), true);

  assert.equal(kernel.isDomainAllowed("https://malicious-attacker.com/steal-creds"), false);
  assert.equal(kernel.isDomainAllowed("https://phishing-portal.org/sysco"), false);

  assert.throws(
    () => kernel.assertDomainAllowed("https://unauthorized-domain.com/data"),
    /SECURITY_DOMAIN_VIOLATION/
  );
});

test("SupplierScraperKernel extracts tabular catalog rows into exact integer cents", () => {
  const kernel = new SupplierScraperKernel();

  const mockHtml = `
    <html>
      <body>
        <table>
          <thead>
            <tr><th>Product Description</th><th>Quantity</th><th>Unit Price</th></tr>
          </thead>
          <tbody>
            <tr><td>Organic Hard Red Wheat Flour 50lb</td><td>50</td><td>$28.50</td></tr>
            <tr><td>Unbleached Pastry Flour 50lb</td><td>20</td><td>$24.00</td></tr>
            <tr><td>Active Dry Yeast 1lb Bag</td><td>10</td><td>$6.25</td></tr>
          </tbody>
        </table>
      </body>
    </html>
  `;

  const result = kernel.parseHtmlCatalogTable(mockHtml, "Sysco Central Texas");

  assert.equal(result.vendorName, "Sysco Central Texas");
  assert.equal(result.itemsCount, 3);

  const [flour1, flour2, yeast] = result.items;
  assert.equal(flour1.description, "Organic Hard Red Wheat Flour 50lb");
  assert.equal(flour1.quantity, 50);
  assert.equal(flour1.unitPriceCents, 2850);
  assert.equal(flour1.totalCents, 142500);

  assert.equal(flour2.unitPriceCents, 2400);
  assert.equal(yeast.unitPriceCents, 625);
});

test("SupplierScraperKernel saves real invoice buffer and invokes native parser", async () => {
  const kernel = new SupplierScraperKernel({ outputDir: "data/scraped_invoices" });
  const samplePdfPath = "data/benchmark_corpus/07_vector_digital_invoice.pdf";

  assert.ok(existsSync(samplePdfPath), "Sample benchmark PDF must exist");
  const sampleBuffer = readFileSync(samplePdfPath);

  const saved = await kernel.saveScrapedInvoice("scraped_test_invoice.pdf", sampleBuffer, "sme_artisan_bakery");

  assert.equal(saved.fileName, "scraped_test_invoice.pdf");
  assert.equal(saved.mimeType, "application/pdf");
  assert.ok(existsSync(saved.filePath));
  assert.equal(saved.parsed.vendorName, "Bay State Milling Wholesale");
  assert.equal(saved.parsed.totalAmountCents, 826610);
});
