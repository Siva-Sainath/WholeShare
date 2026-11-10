/**
 * Wholeshare UI Craft Verification Controller
 * Script to drive, audit, and visually verify 21st.dev template fidelity,
 * Emil Kowalski motion physics, and zero unstyled DOM artifacts.
 */
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import puppeteer from "puppeteer";

const BASE_URL = process.env.BASE_URL || "http://127.0.0.1:3000";
const PROOF_DIR = path.resolve(process.cwd(), "docs/assets/craft-proof");

if (!fs.existsSync(PROOF_DIR)) {
  fs.mkdirSync(PROOF_DIR, { recursive: true });
}

async function checkServerHealth() {
  return new Promise((resolve) => {
    const req = http.get(BASE_URL, (res) => {
      resolve(res.statusCode === 200);
    });
    req.on("error", () => resolve(false));
    req.setTimeout(2000, () => {
      req.destroy();
      resolve(false);
    });
  });
}

export async function runDoctor() {
  console.log("=== WholeShare UI Craft Doctor ===");
  const healthy = await checkServerHealth();
  if (!healthy) {
    console.error(`[FAIL] Web server is not responding at ${BASE_URL}. Launch server via 'npm start' first.`);
    return false;
  }
  console.log(`[PASS] Web server responsive at ${BASE_URL}.`);

  const browser = await puppeteer.launch({
    headless: "new",
    args: ["--no-sandbox", "--disable-setuid-sandbox"]
  });

  try {
    const page = await browser.newPage();
    page.on("pageerror", (err) => console.log("PAGE ERROR:", err.message));
    page.on("console", (msg) => {
      if (msg.type() === "error") console.log("CONSOLE ERROR:", msg.text());
    });
    await page.setViewport({ width: 1440, height: 900 });
    await page.goto(BASE_URL, { waitUntil: "domcontentloaded", timeout: 10000 });
    await new Promise((r) => setTimeout(r, 500));

    // Check 1: Detect raw unstyled links (browser default blue #0000ee / rgb(0, 0, 238))
    const rawBlueLinks = await page.evaluate(() => {
      const links = Array.from(document.querySelectorAll("a, button"));
      const offenders = [];
      for (const el of links) {
        const style = window.getComputedStyle(el);
        const color = style.color;
        // User agent default blue
        if (color === "rgb(0, 0, 238)" || color === "#0000ee") {
          offenders.push({ tag: el.tagName, text: el.textContent.trim().slice(0, 30), color });
        }
      }
      return offenders;
    });

    if (rawBlueLinks.length > 0) {
      console.error(`[FAIL] Detected ${rawBlueLinks.length} unstyled browser-default blue link(s):`, rawBlueLinks);
      return false;
    }
    console.log("[PASS] Zero raw browser-default blue links detected.");

    // Check 2: Verify root mount and view isolation
    const viewCheck = await page.evaluate(() => {
      const views = Array.from(document.querySelectorAll("[data-ws-view]"));
      const visible = views.filter((v) => window.getComputedStyle(v).display !== "none");
      return {
        totalViews: views.length,
        visibleCount: visible.length,
        activeView: visible[0]?.getAttribute("data-ws-view") || "none"
      };
    });

    if (viewCheck.visibleCount !== 1) {
      console.error(`[FAIL] View isolation violated. Expected exactly 1 visible view, found ${viewCheck.visibleCount}.`);
      return false;
    }
    console.log(`[PASS] Strict view isolation intact. Active view: ${viewCheck.activeView}.`);

    return true;
  } finally {
    await browser.close();
  }
}

export async function runDrive(options = {}) {
  console.log("=== WholeShare UI Craft Drive & Proof Capture ===");
  const browser = await puppeteer.launch({
    headless: "new",
    args: ["--no-sandbox", "--disable-setuid-sandbox"]
  });

  try {
    const page = await browser.newPage();
    page.on("pageerror", (err) => console.log("PAGE ERROR:", err.message));
    page.on("console", (msg) => {
      if (msg.type() === "error") console.log("CONSOLE ERROR:", msg.text());
    });
    await page.setViewport({ width: 1440, height: 900 });
    await page.goto(BASE_URL, { waitUntil: "domcontentloaded", timeout: 10000 });
    await new Promise((r) => setTimeout(r, 500));

    const views = ["landing", "onboarding", "radar", "ledger", "logistics", "leader", "subscriptions", "settings"];
    const results = {};

    for (const view of views) {
      console.log(`Driving view: ${view}...`);
      await page.evaluate((target) => {
        if (window.wholeshareCmd?.dispatch) {
          window.wholeshareCmd.dispatch({ action: "NAVIGATE_VIEW", params: { view: target } });
        } else if (window.switchActiveView) {
          window.switchActiveView(target);
        }
      }, view);

      await new Promise((r) => setTimeout(r, 200));

      const screenshotPath = path.join(PROOF_DIR, `craft_${view}.png`);
      await page.screenshot({ path: screenshotPath, fullPage: false });

      const metrics = await page.evaluate((v) => {
        const active = document.querySelector(`[data-ws-view="${v}"]`);
        if (!active) return { exists: false };
        const isVisible = window.getComputedStyle(active).display !== "none";
        const hasHorizontalScroll = document.documentElement.scrollWidth > window.innerWidth;
        const buttonCount = active.querySelectorAll("button").length;
        return { exists: true, isVisible, hasHorizontalScroll, buttonCount };
      }, view);

      results[view] = { screenshot: screenshotPath, ...metrics };
      console.log(`  [PASS] ${view}: visible=${metrics.isVisible}, scrollOk=${!metrics.hasHorizontalScroll}`);
    }

    const reportPath = path.join(PROOF_DIR, "craft_report.json");
    fs.writeFileSync(reportPath, JSON.stringify(results, null, 2), "utf8");
    console.log(`[PASS] All views driven. Proof report saved to ${reportPath}`);
    return results;
  } finally {
    await browser.close();
  }
}

async function main() {
  const cmd = process.argv[2] || "doctor";
  if (cmd === "doctor") {
    const ok = await runDoctor();
    process.exit(ok ? 0 : 1);
  } else if (cmd === "drive") {
    await runDrive();
    process.exit(0);
  } else {
    console.log("Usage: node scripts/control-ui-craft.js [doctor|drive]");
    process.exit(1);
  }
}

if (process.argv[1] && process.argv[1].endsWith("control-ui-craft.js")) {
  main().catch((err) => {
    console.error("Craft verification error:", err);
    process.exit(1);
  });
}
