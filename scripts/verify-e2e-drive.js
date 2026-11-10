import puppeteer from "puppeteer";
import { writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";

async function runE2eDrive() {
  const browser = await puppeteer.launch({ headless: "new", args: ["--no-sandbox", "--disable-setuid-sandbox"] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  const steps = [];
  const record = (step, pass, detail) => {
    steps.push({ step, pass: Boolean(pass), detail });
    console.log(`[${pass ? "PASS" : "FAIL"}] ${step}: ${detail}`);
  };

  try {
    const pageErrors = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    await page.goto("http://127.0.0.1:3000", { waitUntil: "domcontentloaded" });
    await page.waitForSelector(".ws-root-viewport");
    await page.evaluate(() => document.querySelector(".ws-paypal-attribution")?.scrollIntoView());
    await page.waitForFunction(() => {
      const img = document.querySelector(".ws-paypal-attribution img");
      return Boolean(img && img.naturalWidth > 0);
    });
    const paypalAttribution = await page.$eval(".ws-paypal-attribution", (footer) => ({
      text: footer.textContent ?? "",
      logoAlt: footer.querySelector("img")?.getAttribute("alt") ?? "",
      logoLoaded: Boolean(footer.querySelector("img")?.naturalWidth)
    }));
    record("PAYPAL_ATTRIBUTION", paypalAttribution.text.includes("Payments powered by") && paypalAttribution.logoAlt === "PayPal" && paypalAttribution.logoLoaded, `${paypalAttribution.text.trim()} logo loaded=${paypalAttribution.logoLoaded}`);
    const landing = await page.$$eval("[data-ws-view='landing']", (nodes) => nodes.length);
    record("LANDING_RENDER", landing === 1, `landing view count ${landing}`);

    for (const view of ["onboarding", "leader", "subscriptions", "settings"]) {
      const accepted = await page.evaluate((nextView) => window.wholeshareCmd.dispatch({ action: "NAVIGATE_VIEW", params: { view: nextView } }), view);
      const count = await page.$$eval(`[data-ws-view='${view}']`, (nodes) => nodes.length);
      record(`VIEW_${view.toUpperCase()}`, accepted && count === 1, `visible view count ${count}`);
    }

    await page.evaluate(() => window.wholeshareCmd.dispatch({ action: "NAVIGATE_VIEW", params: { view: "radar" } }));
    await page.waitForSelector("[data-ws-view='radar']");
    await page.waitForFunction(() => document.querySelectorAll("[data-testid='clan-card']").length > 0 || document.querySelector("[role='alert']"));
    const cardCount = await page.$$eval("[data-testid='clan-card']", (nodes) => nodes.length);
    record("RADAR_API_DATA", cardCount > 0, `${cardCount} API-backed clan cards`);

    await page.locator(".ws-radar-search input").fill("Austin");
    const filteredCount = await page.$$eval("[data-testid='clan-card']", (nodes) => nodes.length);
    const firstCardText = filteredCount ? await page.$eval("[data-testid='clan-card']", (node) => node.textContent ?? "") : "";
    record("RADAR_SEARCH", filteredCount > 0 && firstCardText.includes("Austin"), `${filteredCount} matching cards`);
    await page.$eval(".ws-radar-action", (button) => button.click());
    await page.waitForFunction(() => document.querySelector("#ws-rules-confirmation-checkbox") || document.querySelector("[data-testid='paypal-pledge']"));
    const checkbox = await page.$("#ws-rules-confirmation-checkbox");
    if (checkbox) {
      await page.click("#ws-rules-confirmation-checkbox");
    }
    await page.waitForSelector("[data-testid='paypal-pledge']");
    await page.locator(".ws-paypal-field input").fill("Judge Demo Buyer");
    await page.waitForFunction(() => document.querySelector(".ws-paypal-quote strong")?.textContent !== "Calculating…");
    await page.waitForFunction(() => document.querySelector(".ws-paypal-button-host paypal-button") || document.querySelector(".ws-paypal-status[role='alert']"), { timeout: 20000 });
    const paypalCheckout = await page.evaluate(() => ({
      buttonReady: Boolean(document.querySelector(".ws-paypal-button-host paypal-button")),
      enabled: !document.querySelector(".ws-paypal-button-host")?.classList.contains("is-disabled"),
      amount: document.querySelector(".ws-paypal-quote strong")?.textContent ?? "",
      error: document.querySelector(".ws-paypal-status[role='alert']")?.textContent ?? ""
    }));
    record("PAYPAL_CHECKOUT_READY", paypalCheckout.buttonReady && paypalCheckout.enabled && Boolean(paypalCheckout.amount), paypalCheckout.buttonReady && paypalCheckout.enabled ? `PayPal button ready for ${paypalCheckout.amount}` : paypalCheckout.error || "PayPal button unavailable");
    await page.$eval("[aria-label='Close group details']", (button) => button.click());

    await page.evaluate(() => window.wholeshareCmd.dispatch({ action: "NAVIGATE_VIEW", params: { view: "ledger" } }));
    await page.waitForSelector("[data-ws-view='ledger']");
    await page.waitForFunction(() => document.querySelector(".ag-root-wrapper") || document.querySelector("[role='alert']"));
    const ledgerRows = await page.$$eval(".ag-row", (nodes) => nodes.length);
    record("LEDGER_API_DATA", ledgerRows > 0, `${ledgerRows} live ledger rows`);

    await page.evaluate(() => window.wholeshareCmd.dispatch({ action: "NAVIGATE_VIEW", params: { view: "logistics" } }));
    await page.waitForSelector("[data-ws-view='logistics']");
    const claimFields = await page.$$eval(".ws-claim-form input[required], .ws-claim-form textarea[required]", (nodes) => nodes.length);
    record("CLAIM_INTAKE_FORM", claimFields === 8, `${claimFields} required fields`);
    record("BROWSER_ERRORS", pageErrors.length === 0, pageErrors.length ? pageErrors.join(" | ") : "none");

    await page.evaluate(() => document.querySelector(".ws-paypal-attribution")?.scrollIntoView({ block: "end" }));
    const footerInView = await page.$eval(".ws-paypal-attribution", (footer) => {
      const rect = footer.getBoundingClientRect();
      return rect.top >= 0 && rect.bottom <= window.innerHeight + 5;
    });
    record("PAYPAL_ATTRIBUTION_VISIBLE", footerInView, `footer inside viewport=${footerInView}`);

    mkdirSync(resolve(process.cwd(), "docs/assets"), { recursive: true });
    const screenshot = "docs/assets/proof_e2e_journey_live.png";
    await page.screenshot({ path: resolve(process.cwd(), screenshot), fullPage: false });
    const paypalScreenshot = "docs/assets/proof_paypal_attribution.png";
    await page.screenshot({ path: resolve(process.cwd(), paypalScreenshot), fullPage: false });
    const allPassed = steps.length > 0 && steps.every((step) => step.pass);
    const report = { executedAt: new Date().toISOString(), verdict: allPassed ? "ALL_STEPS_PASSED" : "FAILED", steps, screenshot, paypalScreenshot };
    writeFileSync(resolve(process.cwd(), "docs/assets/e2e_drive_report.json"), JSON.stringify(report, null, 2));
    if (!allPassed) process.exitCode = 1;
  } finally {
    await browser.close();
  }
}

runE2eDrive().catch((error) => {
  console.error("E2E drive failed:", error);
  process.exit(1);
});
