import puppeteer from "puppeteer";
import fs from "fs/promises";
import path from "path";

async function run() {
  const results = {
    timestamp: new Date().toISOString(),
    tests: []
  };

  const browser = await puppeteer.launch({
    headless: "new",
    args: ["--no-sandbox", "--disable-setuid-sandbox"]
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });

    // Navigate to radar view
    await page.goto("http://localhost:3000/#radar", { waitUntil: "domcontentloaded" });
    await page.waitForSelector(".ws-radar-card", { timeout: 10000 });

    // Test 1: FILTER_CLANS Passing
    {
      const dispatched = await page.evaluate(() => {
        return window.wholeshareCmd.dispatch({
          action: "FILTER_CLANS",
          params: { query: "Austin" }
        });
      });
      await new Promise((r) => setTimeout(r, 600));

      const inputVal = await page.$eval(".ws-radar-search input", (el) => el.value);
      const cardCount = await page.$$eval(".ws-radar-card", (cards) => cards.length);
      const passes = dispatched && inputVal === "Austin" && cardCount > 0;

      results.tests.push({
        action: "FILTER_CLANS",
        case: "PASSING",
        input: { query: "Austin" },
        dispatched,
        observed: { inputVal, cardCount },
        status: passes ? "PASS" : "FAIL"
      });

      await page.screenshot({ path: "docs/assets/gemini-phase4/filter.png" });
    }

    // Test 1: FILTER_CLANS Failing (no matches)
    {
      const dispatched = await page.evaluate(() => {
        return window.wholeshareCmd.dispatch({
          action: "FILTER_CLANS",
          params: { query: "NonexistentCityXYZ123" }
        });
      });
      await new Promise((r) => setTimeout(r, 600));

      const messageText = await page.$eval(".ws-radar-message", (el) => el.textContent.trim()).catch(() => "");
      const cardCount = await page.$$eval(".ws-radar-card", (cards) => cards.length);
      const passes = dispatched && messageText === "No groups match these filters." && cardCount === 0;

      results.tests.push({
        action: "FILTER_CLANS",
        case: "FAILING",
        input: { query: "NonexistentCityXYZ123" },
        dispatched,
        observed: { messageText, cardCount },
        status: passes ? "PASS" : "FAIL"
      });
    }

    // Test 2: OPEN_SLIDE_OVER Passing (valid clanId)
    {
      const validClanId = "clan-austin-artisan-sicilian-001";
      const dispatched = await page.evaluate((clanId) => {
        return window.wholeshareCmd.dispatch({
          action: "OPEN_SLIDE_OVER",
          params: { clanId, title: "Purchasing Syndicate Details" }
        });
      }, validClanId);

      await page.waitForSelector(".ws-slide-over-detail-card", { timeout: 6000 });
      const renderedTitle = await page.$eval("#slide-over-heading", (el) => el.textContent.trim());
      const renderedSku = await page.$eval(".ws-slide-over-detail-card .ws-radar-sku", (el) => el.textContent.trim());
      const passes = dispatched && renderedTitle.length > 0 && renderedSku.includes("Pistachio");

      results.tests.push({
        action: "OPEN_SLIDE_OVER",
        case: "PASSING",
        input: { clanId: validClanId },
        dispatched,
        observed: { renderedTitle, renderedSku },
        status: passes ? "PASS" : "FAIL"
      });

      await page.screenshot({ path: "docs/assets/gemini-phase4/slide-over.png" });
    }

    // Test 2: OPEN_SLIDE_OVER Failing (invalid clanId)
    {
      const invalidClanId = "nonexistent-clan-999";
      const dispatched = await page.evaluate((clanId) => {
        return window.wholeshareCmd.dispatch({
          action: "OPEN_SLIDE_OVER",
          params: { clanId }
        });
      }, invalidClanId);

      await page.waitForSelector(".ws-slide-over-error", { timeout: 6000 });
      const errorText = await page.$eval(".ws-slide-over-error", (el) => el.textContent.trim());
      const passes = dispatched && errorText.includes("Clan with ID 'nonexistent-clan-999' not found.");

      results.tests.push({
        action: "OPEN_SLIDE_OVER",
        case: "FAILING",
        input: { clanId: invalidClanId },
        dispatched,
        observed: { errorText },
        status: passes ? "PASS" : "FAIL"
      });

      // Close slide-over
      await page.click(".ws-slide-over-close");
      await new Promise((r) => setTimeout(r, 400));
    }

    // Test 3: TRIGGER_ONBOARDING Passing
    {
      const dispatched = await page.evaluate(() => {
        return window.wholeshareCmd.dispatch({
          action: "TRIGGER_ONBOARDING",
          params: {
            businessName: "Acme Specialty Roasters",
            industry: "Specialty Coffee Roasting",
            spendLimit: 45000
          }
        });
      });

      await page.waitForSelector("#viewOnboarding", { timeout: 6000 });
      const businessNameVal = await page.$$eval(".ws-form-grid input", (inputs) => inputs[0]?.value || "");
      const industryVal = await page.$$eval(".ws-form-grid input", (inputs) => inputs[1]?.value || "");
      const passes = dispatched && businessNameVal === "Acme Specialty Roasters" && industryVal === "Specialty Coffee Roasting";

      results.tests.push({
        action: "TRIGGER_ONBOARDING",
        case: "PASSING",
        input: { businessName: "Acme Specialty Roasters", industry: "Specialty Coffee Roasting", spendLimit: 45000 },
        dispatched,
        observed: { businessNameVal, industryVal },
        status: passes ? "PASS" : "FAIL"
      });
    }

    // Test 3: TRIGGER_ONBOARDING Failing (empty payload)
    {
      const dispatched = await page.evaluate(() => {
        return window.wholeshareCmd.dispatch({
          action: "TRIGGER_ONBOARDING",
          params: {}
        });
      });

      await page.waitForSelector("#viewOnboarding", { timeout: 6000 });
      const hash = await page.evaluate(() => window.location.hash);
      const passes = dispatched && hash === "#onboarding";

      results.tests.push({
        action: "TRIGGER_ONBOARDING",
        case: "FAILING",
        input: {},
        dispatched,
        observed: { hash },
        status: passes ? "PASS" : "FAIL"
      });
    }

    // Test 4: EXPORT_SNAPSHOT Passing (real API endpoint call)
    {
      const resJson = await fetch("http://localhost:3000/api/v1/matchmaking/snapshot?format=json");
      const json = await resJson.json();
      const resCsv = await fetch("http://localhost:3000/api/v1/matchmaking/snapshot?format=csv");
      const csv = await resCsv.text();

      const dispatched = await page.evaluate(() => {
        return window.wholeshareCmd.dispatch({
          action: "EXPORT_SNAPSHOT",
          params: { format: "json" }
        });
      });

      const passes = dispatched && resJson.status === 200 && Array.isArray(json.clans) && resCsv.status === 200 && csv.startsWith("id,name,sku");

      results.tests.push({
        action: "EXPORT_SNAPSHOT",
        case: "PASSING",
        input: { format: "json" },
        dispatched,
        observed: {
          jsonStatus: resJson.status,
          clanCount: json.clans?.length,
          csvStatus: resCsv.status,
          csvLength: csv.length
        },
        status: passes ? "PASS" : "FAIL"
      });
    }

    // Test 4: EXPORT_SNAPSHOT Failing (invalid format falls back to JSON)
    {
      const resInvalid = await fetch("http://localhost:3000/api/v1/matchmaking/snapshot?format=invalid_format_xyz");
      const jsonFallback = await resInvalid.json();
      const passes = resInvalid.status === 200 && Array.isArray(jsonFallback.clans);

      results.tests.push({
        action: "EXPORT_SNAPSHOT",
        case: "FAILING",
        input: { format: "invalid_format_xyz" },
        dispatched: true,
        observed: { status: resInvalid.status, hasClans: Array.isArray(jsonFallback.clans) },
        status: passes ? "PASS" : "FAIL"
      });
    }

    // Test 5: LEDGER_QUERY Passing
    {
      await page.goto("http://localhost:3000/#ledger", { waitUntil: "domcontentloaded" });
      await page.waitForSelector(".ag-root", { timeout: 10000 });
      await new Promise((r) => setTimeout(r, 600));

      const dispatched = await page.evaluate(() => {
        return window.wholeshareCmd.dispatch({
          action: "LEDGER_QUERY",
          params: { query: "Flour" }
        });
      });
      await new Promise((r) => setTimeout(r, 800));

      const visibleRows = await page.$$eval(".ag-center-cols-container .ag-row", (rows) => rows.length);
      const passes = dispatched && visibleRows === 1;

      results.tests.push({
        action: "LEDGER_QUERY",
        case: "PASSING",
        input: { query: "Flour" },
        dispatched,
        observed: { visibleRows },
        status: passes ? "PASS" : "FAIL"
      });
    }

    // Test 5: LEDGER_QUERY Failing (nonexistent query)
    {
      const dispatched = await page.evaluate(() => {
        return window.wholeshareCmd.dispatch({
          action: "LEDGER_QUERY",
          params: { query: "NonexistentSKU123" }
        });
      });
      await new Promise((r) => setTimeout(r, 800));

      const visibleRows = await page.$$eval(".ag-center-cols-container .ag-row", (rows) => rows.length);
      const pinnedTotal = await page.$$eval(".ag-floating-bottom-container .ag-cell", (cells) => cells.map((c) => c.textContent.trim()).filter(Boolean));
      const passes = dispatched && visibleRows === 0;

      results.tests.push({
        action: "LEDGER_QUERY",
        case: "FAILING",
        input: { query: "NonexistentSKU123" },
        dispatched,
        observed: { visibleRows, pinnedTotal },
        status: passes ? "PASS" : "FAIL"
      });
    }

    // Summary
    const passCount = results.tests.filter((t) => t.status === "PASS").length;
    const totalCount = results.tests.length;
    results.summary = { passCount, totalCount, allPassed: passCount === totalCount };

    await fs.writeFile("docs/assets/gemini-phase4/results.json", JSON.stringify(results, null, 2));
    console.log(JSON.stringify(results.summary));

    if (!results.summary.allPassed) {
      process.exit(1);
    }
  } finally {
    await browser.close();
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
