import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { parseDocumentContent } from "../lib/ingestion-pipeline.js";

const DEFAULT_ALLOWED_DOMAINS = [
  "sysco.com",
  "usfoods.com",
  "restaurantdepot.com",
  "webstaurantstore.com",
  "baystatemilling.com",
  "wholeshare.local",
  "localhost",
  "127.0.0.1"
];

export class SupplierScraperKernel {
  constructor(options = {}) {
    this.allowedDomains = new Set(options.allowedDomains || DEFAULT_ALLOWED_DOMAINS);
    this.outputDir = resolve(process.cwd(), options.outputDir || "data/scraped_invoices");
    if (!existsSync(this.outputDir)) {
      mkdirSync(this.outputDir, { recursive: true });
    }
  }

  isDomainAllowed(targetUrl) {
    try {
      const parsed = new URL(targetUrl);
      const hostname = parsed.hostname.toLowerCase();
      for (const allowed of this.allowedDomains) {
        if (hostname === allowed || hostname.endsWith(`.${allowed}`)) {
          return true;
        }
      }
      return false;
    } catch {
      return false;
    }
  }

  assertDomainAllowed(targetUrl) {
    if (!this.isDomainAllowed(targetUrl)) {
      throw new Error(`SECURITY_DOMAIN_VIOLATION: Navigation to unauthorized domain blocked: ${targetUrl}`);
    }
  }

  parseHtmlCatalogTable(htmlContent, vendorName = "Wholesale Supplier") {
    const items = [];
    const tableRegex = /<tr[^>]*>(.*?)<\/tr>/gis;
    const cellRegex = /<td[^>]*>(.*?)<\/td>/gis;

    let rowMatch;
    let isHeader = true;

    while ((rowMatch = tableRegex.exec(htmlContent)) !== null) {
      if (isHeader) {
        isHeader = false;
        continue;
      }

      const rowHtml = rowMatch[1];
      const cells = [];
      let cellMatch;
      while ((cellMatch = cellRegex.exec(rowHtml)) !== null) {
        cells.push(cellMatch[1].replace(/<[^>]+>/g, "").trim());
      }

      if (cells.length >= 3) {
        const description = cells[0];
        const rawQuantity = parseInt(cells[1].replace(/[^\d]/g, ""), 10) || 1;
        const rawPrice = parseFloat(cells[2].replace(/[^\d.]/g, "")) || 0;
        const unitPriceCents = Math.round(rawPrice * 100);

        if (description && unitPriceCents > 0) {
          items.push({
            description,
            quantity: rawQuantity,
            unitPriceCents,
            totalCents: unitPriceCents * rawQuantity
          });
        }
      }
    }

    return {
      vendorName,
      itemsCount: items.length,
      items,
      extractedAt: new Date().toISOString()
    };
  }

  async saveScrapedInvoice(fileName, buffer, buyerId) {
    const filePath = resolve(this.outputDir, fileName);
    writeFileSync(filePath, buffer);

    const ext = fileName.split(".").pop().toLowerCase();
    let mimeType = "application/octet-stream";
    if (ext === "pdf") mimeType = "application/pdf";
    else if (ext === "xlsx") mimeType = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    else if (ext === "csv") mimeType = "text/csv";
    else if (ext === "png") mimeType = "image/png";

    const parsed = await parseDocumentContent(buffer, fileName, mimeType);

    return {
      filePath,
      fileName,
      mimeType,
      buyerId,
      parsed
    };
  }
}

export const supplierScraper = new SupplierScraperKernel();
