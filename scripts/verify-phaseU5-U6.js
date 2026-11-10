import puppeteer from "puppeteer";
import { mkdirSync, writeFileSync } from "node:fs";

async function runVerification() {
  const report = {
    timestamp: new Date().toISOString(),
    passed: true,
    steps: []
  };

  mkdirSync("docs/assets/gemini-phaseU5", { recursive: true });
  mkdirSync("docs/assets/gemini-phaseU6", { recursive: true });

  const browser = await puppeteer.launch({
    headless: "new",
    args: ["--no-sandbox", "--disable-setuid-sandbox"]
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });

    // Step 1. Initial page load
    await page.goto("http://127.0.0.1:3000", { waitUntil: "domcontentloaded" });
    await page.waitForSelector(".ws-root-viewport", { timeout: 15000 });
    report.steps.push({ step: "PAGE_LOAD", status: "PASS", message: "Root viewport loaded." });
    console.log("[PASS] Root viewport loaded.");

    // Step 2. Discover / Radar Table View
    await page.evaluate(() => window.wholeshareCmd.dispatch({ action: "NAVIGATE_VIEW", params: { view: "discover" } }));
    await page.waitForSelector("#viewDiscover", { timeout: 15000 });
    await page.waitForSelector("button[aria-label='Table view']", { timeout: 15000 });
    await page.click("button[aria-label='Table view']");
    await page.waitForSelector("[aria-label='Buying groups table'] .ag-root-wrapper", { timeout: 15000 });
    await new Promise((resolve) => setTimeout(resolve, 1500));
    await page.screenshot({ path: "docs/assets/gemini-phaseU5/radar-table-view.png" });
    report.steps.push({
      step: "DISCOVER_TABLE_VIEW",
      status: "PASS",
      evidence: "docs/assets/gemini-phaseU5/radar-table-view.png"
    });
    console.log("[PASS] Discover table view captured.");

    // Step 3. Inventory Demand View
    await page.evaluate(() => window.wholeshareCmd.dispatch({ action: "NAVIGATE_VIEW", params: { view: "inventory" } }));
    await page.waitForSelector("[data-ws-view='inventory']", { timeout: 15000 });
    await page.waitForSelector("[data-ws-view='inventory'] .ag-root-wrapper", { timeout: 15000 });
    await new Promise((resolve) => setTimeout(resolve, 1500));
    await page.screenshot({ path: "docs/assets/gemini-phaseU5/inventory-demand-grid.png" });
    report.steps.push({
      step: "INVENTORY_DEMAND_VIEW",
      status: "PASS",
      evidence: "docs/assets/gemini-phaseU5/inventory-demand-grid.png"
    });
    console.log("[PASS] Inventory demand grid captured.");

    // Step 4. Logistics View
    await page.evaluate(() => window.wholeshareCmd.dispatch({ action: "NAVIGATE_VIEW", params: { view: "logistics" } }));
    await page.waitForSelector("[data-ws-view='logistics']", { timeout: 15000 });
    await page.waitForSelector("[aria-label='Damage claims records'] .ag-root-wrapper", { timeout: 15000 });
    await page.waitForSelector("[aria-label='Shipment records'] .ag-root-wrapper", { timeout: 15000 });
    await new Promise((resolve) => setTimeout(resolve, 1500));
    await page.screenshot({ path: "docs/assets/gemini-phaseU5/logistics-claims-grid.png" });
    report.steps.push({
      step: "LOGISTICS_CLAIMS_AND_SHIPMENTS_VIEW",
      status: "PASS",
      evidence: "docs/assets/gemini-phaseU5/logistics-claims-grid.png"
    });
    console.log("[PASS] Logistics claims and shipments grids captured.");

    // Step 5. Leader View
    await page.evaluate(() => window.wholeshareCmd.dispatch({ action: "NAVIGATE_VIEW", params: { view: "leader" } }));
    await page.waitForSelector("[data-ws-view='leader']", { timeout: 15000 });
    await page.waitForSelector("[aria-label='Member escrow authorizations'] .ag-root-wrapper", { timeout: 15000 });
    await new Promise((resolve) => setTimeout(resolve, 1500));
    await page.screenshot({ path: "docs/assets/gemini-phaseU5/leader-authorizations-grid.png" });
    report.steps.push({
      step: "LEADER_AUTHORIZATIONS_VIEW",
      status: "PASS",
      evidence: "docs/assets/gemini-phaseU5/leader-authorizations-grid.png"
    });
    console.log("[PASS] Leader authorizations grid captured.");

    // Step 6. AG Studio Insights View
    await page.evaluate(() => window.wholeshareCmd.dispatch({ action: "NAVIGATE_VIEW", params: { view: "insights" } }));
    await page.waitForSelector("[data-ws-view='insights']", { timeout: 15000 });
    await new Promise((resolve) => setTimeout(resolve, 2500));
    await page.screenshot({ path: "docs/assets/gemini-phaseU6/insights-view.png" });
    report.steps.push({
      step: "AG_STUDIO_INSIGHTS_VIEW",
      status: "PASS",
      evidence: "docs/assets/gemini-phaseU6/insights-view.png"
    });
    console.log("[PASS] AG Studio Insights view captured.");

    // Step 7. Check AI responses endpoint
    const aiCheckRes = await fetch("http://127.0.0.1:3000/api/ai/responses");
    if (!aiCheckRes.ok) {
      throw new Error(`AI responses GET endpoint failed with status ${aiCheckRes.status}.`);
    }
    const aiData = await aiCheckRes.json();
    if (aiData.status !== "ONLINE") {
      throw new Error(`AI responses reported status ${aiData.status}.`);
    }
    report.steps.push({
      step: "AI_PROXY_ONLINE",
      status: "PASS",
      target: aiData.target,
      modelCount: aiData.models?.length || 0
    });
    console.log("[PASS] AI responses proxy online with " + (aiData.models?.length || 0) + " models.");

    writeFileSync("docs/assets/gemini-phaseU5/u5-u6-verification-report.json", JSON.stringify(report, null, 2));
    console.log("[PASS] All Phase U5 and Phase U6 verifications completed successfully.");
  } catch (error) {
    report.passed = false;
    report.error = error.message;
    writeFileSync("docs/assets/gemini-phaseU5/u5-u6-verification-report.json", JSON.stringify(report, null, 2));
    console.error("[FAIL] Verification failed.", error);
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
}

runVerification();
