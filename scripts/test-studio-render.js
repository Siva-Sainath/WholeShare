import puppeteer from "puppeteer";
import fs from "fs/promises";
import path from "path";

async function main() {
  const evidenceDir = path.resolve(process.cwd(), "docs/assets/unify-screens");
  await fs.mkdir(evidenceDir, { recursive: true });

  const browser = await puppeteer.launch({
    headless: "new",
    args: ["--no-sandbox", "--disable-setuid-sandbox"]
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 1200 });

    // Ensure onboarding is marked completed in localStorage so views load directly
    await page.goto("http://localhost:3000/#my-groups", { waitUntil: "domcontentloaded" });
    await page.evaluate(() => {
      localStorage.setItem("wholeshare_onboarding_confirmed", "true");
    });
    await page.goto("http://localhost:3000/#my-groups", { waitUntil: "domcontentloaded" });
    await new Promise((r) => setTimeout(r, 2000));

    // Check if Studio rendered
    const studioExists = await page.$(".ag-studio, [data-ag-studio], .ag-studio-page") !== null;
    console.log(`[INFO] Studio container found in DOM: ${studioExists}`);

    // Take screenshot of My Groups including Studio and Ledger
    await page.screenshot({ path: path.join(evidenceDir, "3-my-groups-stitch.png"), fullPage: true });
    console.log("[INFO] Saved full page screenshot to docs/assets/unify-screens/3-my-groups-stitch.png");

  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
