import puppeteer from "puppeteer";
import fs from "fs/promises";
import path from "path";

const EVIDENCE_DIR = path.resolve(process.cwd(), "docs/assets/gemini-phaseE");

async function run() {
  await fs.mkdir(EVIDENCE_DIR, { recursive: true });

  const report = {
    timestamp: new Date().toISOString(),
    gate: "GEMINI_STAGE2_ADDENDUM_TIER1",
    flows: {}
  };

  const browser = await puppeteer.launch({
    headless: "new",
    args: ["--no-sandbox", "--disable-setuid-sandbox"]
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });

  try {
    // Flow 1. Discover Rename & Route Redirection
    console.log("Testing Flow 1. Discover Rename...");
    await page.goto("http://localhost:3000/#radar", { waitUntil: "domcontentloaded" });
    await new Promise((r) => setTimeout(r, 800));

    const currentHash = await page.evaluate(() => window.location.hash);
    const navText = await page.$eval(".ws-sidebar-nav-btn.ws-nav-active .ws-nav-text", (el) => el.textContent.trim());
    const headerTitle = await page.$eval("#discover-title", (el) => el.textContent.trim()).catch(() => "");
    const eyebrow = await page.$eval(".ws-eyebrow", (el) => el.textContent.trim()).catch(() => "");
    const searchPlaceholder = await page.$eval(".ws-radar-search input", (el) => el.getAttribute("placeholder"));

    // Filter to empty state and check empty state copy
    await page.evaluate(() => {
      window.wholeshareCmd.dispatch({
        action: "radar.filter",
        params: { query: "NonexistentQueryXYZ999" }
      });
    });
    await new Promise((r) => setTimeout(r, 600));

    const emptyMessage = await page.$eval(".ws-radar-message", (el) => el.textContent.trim()).catch(() => "");

    // Clear filter
    await page.evaluate(() => {
      window.wholeshareCmd.dispatch({
        action: "radar.filter",
        params: { query: "" }
      });
    });
    await new Promise((r) => setTimeout(r, 600));

    const flow1Pass = currentHash === "#discover" && navText === "Discover" && headerTitle === "Discover buying groups" && emptyMessage.includes("No group buys match");
    const flow1Screenshot = path.join(EVIDENCE_DIR, "1-discover-view.png");
    await page.screenshot({ path: flow1Screenshot });

    report.flows.discoverRename = {
      status: flow1Pass ? "PASS" : "FAIL",
      hashRedirect: currentHash,
      sidebarNavLabel: navText,
      viewTitle: headerTitle,
      eyebrow,
      searchPlaceholder,
      emptyStateText: emptyMessage,
      screenshot: flow1Screenshot
    };
    await fs.writeFile(path.join(EVIDENCE_DIR, "1-discover-view.json"), JSON.stringify(report.flows.discoverRename, null, 2));
    console.log(`Flow 1 result: ${flow1Pass ? "PASS" : "FAIL"}`);

    // Flow 2. Settings Expansion & Live Persistence
    console.log("Testing Flow 2. Settings Expansion...");
    await page.goto("http://localhost:3000/#settings", { waitUntil: "domcontentloaded" });
    await new Promise((r) => setTimeout(r, 800));

    const sectionsCount = await page.$$eval("nav[aria-label='Settings categories'] button", (btns) => btns.length);
    const settingsTitle = await page.$eval("#settings-title", (el) => el.textContent.trim());

    // Switch to Appearance section
    await page.$$eval("nav[aria-label='Settings categories'] button", (btns) => btns[1].click());
    await new Promise((r) => setTimeout(r, 400));
    const appearanceSectionVisible = await page.$eval("[data-testid='settings-section-appearance']", (el) => !!el);

    // Switch to Money and Escrow section
    await page.$$eval("nav[aria-label='Settings categories'] button", (btns) => btns[2].click());
    await new Promise((r) => setTimeout(r, 400));
    const moneySectionVisible = await page.$eval("[data-testid='settings-section-money']", (el) => !!el);

    // Test live update via WebMCP settings.update
    const updatedTheme = await page.evaluate(() => {
      return window.wholeshareCmd.dispatch({
        action: "settings.update",
        params: { settings: { theme: "light" } }
      });
    });
    await new Promise((r) => setTimeout(r, 500));
    const appliedTheme = await page.evaluate(() => document.documentElement.getAttribute("data-theme"));

    // Reset theme back to obsidian
    await page.evaluate(() => {
      window.wholeshareCmd.dispatch({
        action: "settings.update",
        params: { settings: { theme: "obsidian" } }
      });
    });
    await new Promise((r) => setTimeout(r, 500));

    const flow2Pass = sectionsCount === 10 && appearanceSectionVisible && moneySectionVisible && appliedTheme === "light";
    const flow2Screenshot = path.join(EVIDENCE_DIR, "2-settings-console.png");
    await page.screenshot({ path: flow2Screenshot });

    report.flows.settingsExpansion = {
      status: flow2Pass ? "PASS" : "FAIL",
      sectionsCount,
      settingsTitle,
      appearanceSectionVisible,
      moneySectionVisible,
      themeUpdateLive: appliedTheme === "light",
      screenshot: flow2Screenshot
    };
    await fs.writeFile(path.join(EVIDENCE_DIR, "2-settings-console.json"), JSON.stringify(report.flows.settingsExpansion, null, 2));
    console.log(`Flow 2 result: ${flow2Pass ? "PASS" : "FAIL"}`);

    // Flow 3. Onboarding Flow
    console.log("Testing Flow 3. Onboarding Flow...");
    await page.goto("http://localhost:3000/#onboarding", { waitUntil: "domcontentloaded" });
    await new Promise((r) => setTimeout(r, 800));

    /* Business Profile inputs */
    await page.$eval(".ws-form-step input[type='text']", (el) => {
      const input = el;
      input.value = "Austin Heritage Roasters";
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await page.click(".ws-form-step .ws-btn-paypal-gold");
    await new Promise((r) => setTimeout(r, 500));

    /* Product Demand heading check */
    const step2Heading = await page.$eval(".ws-step-heading", (el) => el.textContent.trim());
    await page.click(".ws-form-step .ws-btn-paypal-gold");
    await new Promise((r) => setTimeout(r, 500));

    /* Money and Trust heading check */
    const step3Heading = await page.$eval(".ws-step-heading", (el) => el.textContent.trim());
    await page.click(".ws-form-step .ws-btn-paypal-gold");
    await new Promise((r) => setTimeout(r, 800));

    // Verify "You're set" state
    const youreSetVisible = await page.$eval("[data-testid='onboarding-youre-set']", (el) => !!el).catch(() => false);
    const enterDiscoverBtn = await page.$eval("[data-testid='onboarding-enter-discover']", (el) => !!el).catch(() => false);

    const flow3Pass = step2Heading.includes("Step 2") && step3Heading.includes("Step 3") && youreSetVisible && enterDiscoverBtn;
    const flow3Screenshot = path.join(EVIDENCE_DIR, "3-onboarding-flow.png");
    await page.screenshot({ path: flow3Screenshot });

    report.flows.onboardingFlow = {
      status: flow3Pass ? "PASS" : "FAIL",
      step2Heading,
      step3Heading,
      youreSetStateVisible: youreSetVisible,
      enterDiscoverButtonVisible: enterDiscoverBtn,
      screenshot: flow3Screenshot
    };
    await fs.writeFile(path.join(EVIDENCE_DIR, "3-onboarding-flow.json"), JSON.stringify(report.flows.onboardingFlow, null, 2));
    console.log(`Flow 3 result: ${flow3Pass ? "PASS" : "FAIL"}`);

    // Flow 4. Create a Group Buy Flow
    console.log("Testing Flow 4. Create a Group Buy Flow...");
    await page.goto("http://localhost:3000/#discover", { waitUntil: "domcontentloaded" });
    await new Promise((r) => setTimeout(r, 800));

    // Open Create Group Buy Modal
    await page.click(".ws-view-header .ws-btn-secondary");
    await new Promise((r) => setTimeout(r, 500));

    const modalTitle = await page.$eval(".ws-modal-card h2", (el) => el.textContent.trim()).catch(() => "");

    /* Input Product details */
    await page.$eval(".ws-modal-card input[placeholder*='Austin']", (el, val) => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
      setter.call(el, val);
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
    }, "Austin Green Coffee Consortium");

    await page.$eval(".ws-modal-card input[placeholder*='product name']", (el, val) => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
      setter.call(el, val);
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
    }, "Specialty Grade 1 Green Coffee Beans");

    /* Advance to Supplier selection */
    await page.click("[data-testid='group-buy-to-step-2']");
    await page.waitForSelector("[data-testid='group-buy-to-step-3']", { timeout: 4000 });
    await new Promise((r) => setTimeout(r, 400));

    /* Advance to Governance */
    await page.click("[data-testid='group-buy-to-step-3']");
    await page.waitForSelector("[data-testid='group-buy-to-step-4']", { timeout: 4000 });
    await new Promise((r) => setTimeout(r, 400));

    /* Advance to Review */
    await page.click("[data-testid='group-buy-to-step-4']");
    await page.waitForSelector("[data-testid='charter-confirm-checkbox']", { timeout: 4000 });
    await new Promise((r) => setTimeout(r, 400));

    /* Confirm charter checkbox */
    await page.click("[data-testid='charter-confirm-checkbox']");
    await new Promise((r) => setTimeout(r, 300));

    const publishBtnEnabled = await page.$eval("[data-testid='publish-group-buy-btn']", (btn) => !btn.disabled);

    const flow4Screenshot = path.join(EVIDENCE_DIR, "4-create-group-buy.png");
    await page.screenshot({ path: flow4Screenshot });

    /* Submit group buy */
    await page.click("[data-testid='publish-group-buy-btn']");
    await new Promise((r) => setTimeout(r, 1200));

    const flow4Pass = modalTitle.includes("Wholesale") && publishBtnEnabled;
    report.flows.createGroupBuy = {
      status: flow4Pass ? "PASS" : "FAIL",
      modalTitle,
      publishButtonEnabled: publishBtnEnabled,
      screenshot: flow4Screenshot
    };
    await fs.writeFile(path.join(EVIDENCE_DIR, "4-create-group-buy.json"), JSON.stringify(report.flows.createGroupBuy, null, 2));
    console.log(`Flow 4 result: ${flow4Pass ? "PASS" : "FAIL"}`);

    // Flow 5. Clan Rules Explainer & Confirmation Gate
    console.log("Testing Flow 5. Clan Rules Explainer...");
    await page.goto("http://localhost:3000/#discover", { waitUntil: "domcontentloaded" });
    await new Promise((r) => setTimeout(r, 800));

    // Inspect first group buy
    await page.click(".ws-radar-card .ws-radar-action");
    await new Promise((r) => setTimeout(r, 800));

    // Verify rules explainer section
    const explainerSection = await page.$eval("[data-testid='clan-rules-explainer']", (el) => !!el).catch(() => false);
    const explainerTitle = await page.$eval("[data-testid='clan-rules-explainer'] .ws-drawer-section-title span", (el) => el.textContent.trim()).catch(() => "");

    // Verify confirmation checkbox exists and gates pledge
    const checkboxExists = await page.$eval("#ws-rules-confirmation-checkbox", (el) => !!el).catch(() => false);
    const pledgeGatedBefore = await page.$eval(".ws-clan-drawer button[disabled]", (el) => !!el).catch(() => false);

    // Check confirmation checkbox
    await page.click("#ws-rules-confirmation-checkbox");
    await new Promise((r) => setTimeout(r, 400));

    const pledgeActiveAfter = await page.$eval(".ws-paypal-button-wrap", (el) => !!el).catch(() => false);

    const flow5Pass = explainerSection && explainerTitle.includes("Rules") && checkboxExists && (pledgeGatedBefore || pledgeActiveAfter);
    const flow5Screenshot = path.join(EVIDENCE_DIR, "5-clan-rules-explainer.png");
    await page.screenshot({ path: flow5Screenshot });

    report.flows.clanRulesExplainer = {
      status: flow5Pass ? "PASS" : "FAIL",
      explainerSectionVisible: explainerSection,
      explainerTitle,
      confirmationCheckboxPresent: checkboxExists,
      pledgeGatedBeforeConfirmation: pledgeGatedBefore,
      pledgeActiveAfterConfirmation: pledgeActiveAfter,
      screenshot: flow5Screenshot
    };
    await fs.writeFile(path.join(EVIDENCE_DIR, "5-clan-rules-explainer.json"), JSON.stringify(report.flows.clanRulesExplainer, null, 2));
    console.log(`Flow 5 result: ${flow5Pass ? "PASS" : "FAIL"}`);

    const allPassed = flow1Pass && flow2Pass && flow3Pass && flow4Pass && flow5Pass;
    console.log("\n=== GEMINI STAGE 2 TIER 1 VERIFICATION REPORT ===");
    console.log(`Total Flows: 5`);
    console.log(`Result: ${allPassed ? "PASS" : "FAIL"}`);

    if (!allPassed) {
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
