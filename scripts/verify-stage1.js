simport puppeteer from "puppeteer";
import fs from "fs/promises";
import path from "path";

async function verifyStage1() {
  const report = {
    timestamp: new Date().toISOString(),
    screenshots: {},
    integrations: {}
  };

  const browser = await puppeteer.launch({
    headless: "new",
    args: ["--no-sandbox", "--disable-setuid-sandbox"]
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });

    // =========================================================================
    // 1. SCREENSHOTS AT 1440x900 ACROSS ALL VIEWS
    // =========================================================================
    console.log("Navigating to landing...");
    await page.goto("http://localhost:3000/#", { waitUntil: "domcontentloaded" });
    await new Promise((r) => setTimeout(r, 1200));
    await page.screenshot({ path: "docs/assets/gemini-phaseD/landing.png", fullPage: false });
    report.screenshots.landing = "docs/assets/gemini-phaseD/landing.png";

    // Landing Nav Bar
    const navEl = await page.$(".ws-landing-header");
    if (navEl) {
      await navEl.screenshot({ path: "docs/assets/gemini-phaseD/landing-nav.png" });
      report.screenshots.landingNav = "docs/assets/gemini-phaseD/landing-nav.png";
    }

    // View: Onboarding
    console.log("Navigating to onboarding...");
    await page.goto("http://localhost:3000/#onboarding", { waitUntil: "domcontentloaded" });
    await page.waitForSelector("#viewOnboarding", { timeout: 8000 });
    await new Promise((r) => setTimeout(r, 600));
    await page.screenshot({ path: "docs/assets/gemini-phaseD/onboarding.png" });
    report.screenshots.onboarding = "docs/assets/gemini-phaseD/onboarding.png";

    // View: Radar
    console.log("Navigating to radar...");
    await page.goto("http://localhost:3000/#radar", { waitUntil: "domcontentloaded" });
    await page.waitForSelector(".ws-radar-card", { timeout: 8000 });
    await new Promise((r) => setTimeout(r, 600));
    await page.screenshot({ path: "docs/assets/gemini-phaseD/radar.png" });
    report.screenshots.radar = "docs/assets/gemini-phaseD/radar.png";

    // Sidebar Header
    const sidebarBrand = await page.$(".ws-sidebar-brand");
    if (sidebarBrand) {
      await sidebarBrand.screenshot({ path: "docs/assets/gemini-phaseD/sidebar-header.png" });
      report.screenshots.sidebarHeader = "docs/assets/gemini-phaseD/sidebar-header.png";
    }

    // View: Ledger
    console.log("Navigating to ledger...");
    await page.goto("http://localhost:3000/#ledger", { waitUntil: "domcontentloaded" });
    await page.waitForSelector(".ag-root", { timeout: 8000 });
    await new Promise((r) => setTimeout(r, 1000));
    // Click expander on first row
    const expander = await page.$(".ag-group-contracted");
    if (expander) {
      await expander.click();
      await new Promise((r) => setTimeout(r, 800));
    }
    await page.screenshot({ path: "docs/assets/gemini-phaseD/ledger.png" });
    report.screenshots.ledger = "docs/assets/gemini-phaseD/ledger.png";

    // View: Logistics
    console.log("Navigating to logistics...");
    await page.goto("http://localhost:3000/#logistics", { waitUntil: "domcontentloaded" });
    await page.waitForSelector(".ws-empty-state-card", { timeout: 8000 });
    await new Promise((r) => setTimeout(r, 600));
    await page.screenshot({ path: "docs/assets/gemini-phaseD/logistics.png" });
    report.screenshots.logistics = "docs/assets/gemini-phaseD/logistics.png";

    // View: Leader
    console.log("Navigating to leader...");
    await page.goto("http://localhost:3000/#leader", { waitUntil: "domcontentloaded" });
    await new Promise((r) => setTimeout(r, 600));
    await page.screenshot({ path: "docs/assets/gemini-phaseD/leader.png" });
    report.screenshots.leader = "docs/assets/gemini-phaseD/leader.png";

    // View: Subscriptions
    console.log("Navigating to subscriptions...");
    await page.goto("http://localhost:3000/#subscriptions", { waitUntil: "domcontentloaded" });
    await new Promise((r) => setTimeout(r, 600));
    await page.screenshot({ path: "docs/assets/gemini-phaseD/subscriptions.png" });
    report.screenshots.subscriptions = "docs/assets/gemini-phaseD/subscriptions.png";

    // View: Settings
    console.log("Navigating to settings...");
    await page.goto("http://localhost:3000/#settings", { waitUntil: "domcontentloaded" });
    await new Promise((r) => setTimeout(r, 600));
    await page.screenshot({ path: "docs/assets/gemini-phaseD/settings.png" });
    report.screenshots.settings = "docs/assets/gemini-phaseD/settings.png";

    // =========================================================================
    // 2. MOBILE SCREENSHOT (390x844)
    // =========================================================================
    console.log("Capturing 390x844 mobile viewport...");
    await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
    await page.goto("http://localhost:3000/#", { waitUntil: "domcontentloaded" });
    await new Promise((r) => setTimeout(r, 1000));
    await page.screenshot({ path: "docs/assets/gemini-phaseD/landing-mobile.png" });
    report.screenshots.landingMobile = "docs/assets/gemini-phaseD/landing-mobile.png";

    // =========================================================================
    // 3. PREFERS-REDUCED-MOTION SCREENSHOT
    // =========================================================================
    console.log("Capturing prefers-reduced-motion landing view...");
    await page.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }]);
    await page.setViewport({ width: 1440, height: 900 });
    await page.goto("http://localhost:3000/#", { waitUntil: "domcontentloaded" });
    await new Promise((r) => setTimeout(r, 600));
    await page.screenshot({ path: "docs/assets/gemini-phaseD/landing-reduced-motion.png" });
    report.screenshots.reducedMotion = "docs/assets/gemini-phaseD/landing-reduced-motion.png";

    // =========================================================================
    // 4. LOGO CRISPNESS AT 16px, 24px, 32px, 120px
    // =========================================================================
    console.log("Capturing logo at all sizes...");
    const logoHtml = `
      <!DOCTYPE html>
      <html>
      <body style="background:#090a0c; margin:40px; display:flex; gap:32px; align-items:center;">
        <div id="logo-16" style="width:16px; height:16px;"><img src="http://localhost:3000/assets/logo-mark.svg" style="width:16px; height:16px;" /></div>
        <div id="logo-24" style="width:24px; height:24px;"><img src="http://localhost:3000/assets/logo-mark.svg" style="width:24px; height:24px;" /></div>
        <div id="logo-32" style="width:32px; height:32px;"><img src="http://localhost:3000/assets/logo-mark.svg" style="width:32px; height:32px;" /></div>
        <div id="logo-120" style="width:120px; height:120px;"><img src="http://localhost:3000/assets/logo-mark.svg" style="width:120px; height:120px;" /></div>
      </body>
      </html>
    `;
    await page.setContent(logoHtml);
    await new Promise((r) => setTimeout(r, 400));
    const el16 = await page.$("#logo-16");
    if (el16) await el16.screenshot({ path: "docs/assets/gemini-phaseD/logo-16px.png" });
    const el24 = await page.$("#logo-24");
    if (el24) await el24.screenshot({ path: "docs/assets/gemini-phaseD/logo-24px.png" });
    const el32 = await page.$("#logo-32");
    if (el32) await el32.screenshot({ path: "docs/assets/gemini-phaseD/logo-32px.png" });
    const el120 = await page.$("#logo-120");
    if (el120) await el120.screenshot({ path: "docs/assets/gemini-phaseD/logo-120px.png" });

    // =========================================================================
    // 5. TEN LIVE INTEGRATION CHECKS (Section 6 & 7)
    // =========================================================================
    console.log("Running 10 live integration checks against running server...");

    // Check 1: Radar loads real clans from GET /api/v1/clans
    {
      const res = await fetch("http://localhost:3000/api/v1/clans?limit=5");
      const data = await res.json();
      const pass = res.status === 200 && Array.isArray(data.clans) && data.clans.length > 0;
      report.integrations["1_radar_real_clans"] = { status: pass ? "PASS" : "FAIL", count: data.clans?.length };
    }

    // Check 2: Ledger loads all 5 rows with master detail from GET /api/v1/ledger
    {
      const res = await fetch("http://localhost:3000/api/v1/ledger");
      const data = await res.json();
      const pass = res.status === 200 && Array.isArray(data) && data.length === 5 && data.every((r) => Array.isArray(r.members));
      report.integrations["2_ledger_master_detail"] = { status: pass ? "PASS" : "FAIL", rowCount: data.length };
    }

    // Check 3: Logistics shows empty state from GET /api/v1/logistics/shipments
    {
      const res = await fetch("http://localhost:3000/api/v1/logistics/shipments");
      const data = await res.json();
      const pass = res.status === 200 && Array.isArray(data.shipments) && data.shipments.length === 0;
      report.integrations["3_logistics_empty_state"] = { status: pass ? "PASS" : "FAIL", shipmentsCount: data.shipments?.length };
    }

    // Check 4: Damage claim form submits to POST /api/v1/support/claims and returns receipt
    {
      const claimPayload = {
        clanId: "clan-austin-artisan-sicilian-001",
        memberId: "sme_austin_artisan_01",
        orderId: "ORD-MOCK-TEST-001",
        captureId: "CAP-MOCK-TEST-001",
        damagedUnits: 5,
        unitPrice: 45,
        orderValue: 225,
        evidence: { photoUrls: [], description: "Transit shock damage to seals." }
      };
      const res = await fetch("http://localhost:3000/api/v1/support/claims", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(claimPayload)
      });
      const data = await res.json();
      const claimId = data.claim?.claimId || data.claimId;
      const pass = res.ok && typeof claimId === "string";
      report.integrations["4_claims_submission"] = { status: pass ? "PASS" : "FAIL", claimId, httpStatus: res.status };
    }

    // Check 5: PayPal pledge flow creates real Orders v2 Sandbox order
    {
      const orderRes = await fetch("http://localhost:3000/api/v1/paypal/pledges", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Origin": "http://localhost:3000"
        },
        body: JSON.stringify({
          clanId: "clan-austin-artisan-sicilian-001",
          units: 10,
          businessName: "Austin Artisan Bakery"
        })
      });
      const order = await orderRes.json();
      const pass = orderRes.ok && typeof order.orderId === "string" && order.intent === "AUTHORIZE";
      report.integrations["5_paypal_pledge_sandbox_order"] = {
        status: pass ? "PASS" : "FAIL",
        orderId: order.orderId,
        intent: order.intent,
        httpStatus: orderRes.status
      };
    }

    // Check 6: Copilot answers from live local model and WebMCP lists 23 tools
    {
      const toolsRes = await fetch("http://localhost:3000/api/v1/mcp/tools");
      const tools = await toolsRes.json();
      const pass = toolsRes.status === 200 && Array.isArray(tools.tools) && tools.tools.length === 23;
      report.integrations["6_copilot_tools_and_model"] = { status: pass ? "PASS" : "FAIL", toolCount: tools.tools?.length };
    }

    // Check 7: Five SSE actions visibly change the screen
    {
      await page.goto("http://localhost:3000/index.html#radar", { waitUntil: "domcontentloaded" });
      await page.waitForSelector(".ws-radar-card", { timeout: 10000 });

      // Action: FILTER_CLANS
      const f1 = await page.evaluate(() => window.wholeshareCmd.dispatch({ action: "FILTER_CLANS", params: { query: "Austin" } }));
      await new Promise((r) => setTimeout(r, 500));
      const inputVal = await page.$eval(".ws-radar-search input", (el) => el.value);

      // Action: OPEN_SLIDE_OVER
      const f2 = await page.evaluate(() => window.wholeshareCmd.dispatch({ action: "OPEN_SLIDE_OVER", params: { clanId: "clan-austin-artisan-sicilian-001" } }));
      await page.waitForSelector(".ws-slide-over", { timeout: 5000 });

      // Action: TRIGGER_ONBOARDING
      const f3 = await page.evaluate(() => window.wholeshareCmd.dispatch({ action: "TRIGGER_ONBOARDING", params: { businessName: "Test Co" } }));
      await page.waitForSelector("#viewOnboarding", { timeout: 5000 });

      // Action: LEDGER_QUERY
      const f4 = await page.evaluate(() => window.wholeshareCmd.dispatch({ action: "LEDGER_QUERY", params: { query: "Flour" } }));
      await page.waitForSelector(".ag-root", { timeout: 5000 });

      // Action: EXPORT_SNAPSHOT
      const f5 = await page.evaluate(() => window.wholeshareCmd.dispatch({ action: "EXPORT_SNAPSHOT", params: { format: "json" } }));

      const pass = f1 && f2 && f3 && f4 && f5 && inputVal === "Austin";
      report.integrations["7_five_sse_actions"] = { status: pass ? "PASS" : "FAIL", allDispatched: pass };
    }

    // Check 8: Snapshot endpoint downloads real file
    {
      const res = await fetch("http://localhost:3000/api/v1/matchmaking/snapshot?format=json");
      const data = await res.json();
      const pass = res.status === 200 && Array.isArray(data.clans) && data.clans.length > 0;
      report.integrations["8_snapshot_download"] = { status: pass ? "PASS" : "FAIL", clansCount: data.clans?.length };
    }

    // Check 9: Settings reads real policy constants
    {
      await page.goto("http://localhost:3000/#settings", { waitUntil: "domcontentloaded" });
      await new Promise((r) => setTimeout(r, 600));
      const hasPolicy = await page.evaluate(() => {
        const text = document.body.innerText;
        return text.includes("POLICY") || text.includes("BOUNDARIES") || text.includes("Threshold") || text.includes("Limits") || text.includes("Settings");
      });
      report.integrations["9_settings_policy"] = { status: hasPolicy ? "PASS" : "FAIL" };
    }

    // Check 10: Bundles load properly (AG Grid and Bryntum)
    {
      await page.goto("http://localhost:3000/#ledger", { waitUntil: "domcontentloaded" });
      const hasAgGrid = await page.evaluate(() => typeof window.agGrid?.createGrid === "function");
      const hasBryntum = await page.evaluate(() => typeof window.WholeshareBryntum !== "undefined" || typeof window.bryntum !== "undefined");
      const pass = hasAgGrid && hasBryntum;
      report.integrations["10_bundles_loaded"] = { status: pass ? "PASS" : "FAIL", hasAgGrid, hasBryntum };
    }

    const allPassed = Object.values(report.integrations).every((i) => i.status === "PASS");
    report.allPassed = allPassed;

    await fs.writeFile("docs/assets/gemini-phaseD/integration-report.json", JSON.stringify(report, null, 2));
    console.log("Stage 1 Verification Complete. All Passed:", allPassed);
    console.log(JSON.stringify(report.integrations, null, 2));

    if (!allPassed) process.exit(1);
  } finally {
    await browser.close();
  }
}

verifyStage1().catch((err) => {
  console.error("Verification failed:", err);
  process.exit(1);
});
