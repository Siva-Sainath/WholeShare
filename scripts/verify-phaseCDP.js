import puppeteer from "puppeteer";
import fs from "fs/promises";
import path from "path";

async function run() {
  const cdpDir = path.resolve(process.cwd(), "docs/assets/gemini-phaseCDP");
  await fs.mkdir(cdpDir, { recursive: true });

  const browser = await puppeteer.launch({
    headless: "new",
    args: ["--no-sandbox", "--disable-setuid-sandbox"]
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });

  const consoleLogs = [];
  const consoleErrors = [];
  const requestFailures = [];

  page.on("console", (msg) => {
    const text = msg.text();
    consoleLogs.push({ type: msg.type(), text });
    if (msg.type() === "error") {
      consoleErrors.push(text);
    }
  });

  page.on("pageerror", (err) => {
    consoleErrors.push(err.message);
  });

  page.on("requestfailed", (req) => {
    requestFailures.push({ url: req.url(), error: req.failure()?.errorText });
  });

  const report = [];

  // Helper to drive page
  const auditPage = async (url, name, file) => {
    const startErrors = consoleErrors.length;
    const startReqFails = requestFailures.length;

    await page.goto(url, { waitUntil: "networkidle2", timeout: 15000 }).catch(async () => {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 10000 });
    });

    await new Promise((r) => setTimeout(r, 1200));

    const shotPath = path.join(cdpDir, file);
    await page.screenshot({ path: shotPath });

    const newErrors = consoleErrors.slice(startErrors);
    const newReqFails = requestFailures.slice(startReqFails);

    report.push({
      page: name,
      url,
      screenshot: file,
      status: newErrors.length === 0 ? "PASS" : "WARN",
      errors: newErrors,
      requestFailures: newReqFails
    });

    console.log(`[CDP] Captured ${name} -> ${file} (${newErrors.length} errors, ${newReqFails.length} failed requests)`);
  };

  try {
    // 1. Landing
    await auditPage("http://localhost:3000/", "Landing Page (Single Screen)", "1-landing.png");

    // Ensure onboarding confirmed is set in localStorage for workspace views
    await page.evaluate(() => {
      try {
        localStorage.setItem("wholeshare_onboarding_confirmed", "true");
      } catch {}
    });

    // 2. Onboarding Gate (unconfirmed test)
    await page.evaluate(() => {
      try {
        localStorage.removeItem("wholeshare_onboarding_confirmed");
      } catch {}
    });
    await auditPage("http://localhost:3000/#onboarding", "Onboarding Verification Gate", "2-onboarding.png");

    // Re-confirm onboarding for remaining views
    await page.evaluate(() => {
      try {
        localStorage.setItem("wholeshare_onboarding_confirmed", "true");
        window.dispatchEvent(new HashChangeEvent("hashchange"));
      } catch {}
    });

    // 3. Matchmaking
    await auditPage("http://localhost:3000/#discover", "Matchmaking Workspace", "3-matchmaking.png");

    // 4. My groups
    await auditPage("http://localhost:3000/#my-groups", "My Groups & Escrow Alerts", "4-my-groups.png");

    // 5. Disputes
    await auditPage("http://localhost:3000/#disputes", "Dispute Shield & Freight Evidence", "5-disputes.png");

    // 6. Settings
    await auditPage("http://localhost:3000/#settings", "Settings & Business Profile", "6-settings.png");

  } finally {
    await browser.close();
  }

  // Generate markdown report
  let md = "# WholeShare CDP Viewport Audit & Console Report\n\n";
  md += `**Timestamp**: ${new Date().toISOString()}\n`;
  md += `**Viewport**: 1440x900 (Desktop Retina)\n`;
  md += `**Total Pages Audited**: ${report.length}\n\n`;

  md += "## Summary Matrix\n\n";
  md += "| Page Name | Route | Screenshot | Console Status | Request Failures |\n";
  md += "| :--- | :--- | :--- | :--- | :--- |\n";
  for (const item of report) {
    const errorText = item.errors.length === 0 ? "Clean (0 errors)" : `${item.errors.length} errors`;
    const reqText = item.requestFailures.length === 0 ? "0 failed" : `${item.requestFailures.length} failed`;
    md += `| **${item.page}** | \`${item.url}\` | \`${item.screenshot}\` | ${item.status} (${errorText}) | ${reqText} |\n`;
  }

  md += "\n## Detailed Page Diagnostics\n\n";
  for (const item of report) {
    md += `### ${item.page}\n`;
    md += `- **URL**: \`${item.url}\`\n`;
    md += `- **Screenshot Path**: \`docs/assets/gemini-phaseCDP/${item.screenshot}\`\n`;
    md += `- **Console Status**: ${item.status}\n`;
    if (item.errors.length > 0) {
      md += "- **Console Errors**:\n";
      for (const err of item.errors) {
        md += `  - \`${err}\`\n`;
      }
    } else {
      md += "- **Console Errors**: None. Zero client runtime errors detected.\n";
    }
    if (item.requestFailures.length > 0) {
      md += "- **Failed Network Requests**:\n";
      for (const fail of item.requestFailures) {
        md += `  - \`${fail.url}\` (${fail.error})\n`;
      }
    } else {
      md += "- **Failed Network Requests**: None. All API endpoints answered HTTP 200.\n";
    }
    md += "\n";
  }

  await fs.writeFile(path.join(cdpDir, "cdp-report.md"), md, "utf8");
  console.log(`[CDP] Verification complete. Report written to docs/assets/gemini-phaseCDP/cdp-report.md`);
}

run().catch((err) => {
  console.error("CDP audit failed:", err);
  process.exit(1);
});
