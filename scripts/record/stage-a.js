// Stage A of the demo recording: landing, onboarding from documents, PayPal connect, discover, group page, pledge approval.
// Credentials come from the environment (PP_EMAIL, PP_PASS) and are never written to disk.
import { writeFileSync, readFileSync, existsSync } from "node:fs";
import { launch, start, sleep, glide, clickText, clickSel, clickHandle, byText, typeHuman, scrollBy, center, OUT } from "./lib.js";

const SITE = "https://wholeshare-app.onrender.com";
const manifestPath = `${OUT}/manifest.json`;
const manifest = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, "utf8")) : [];
const save = () => writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
const ctx = await launch();
const { page, browser } = ctx;
page.on("pageerror", (e) => console.log("PAGEERROR", e.message.slice(0, 160)));

// Runs one recorded segment. speed is how much the editor should speed it up (1 = real time).
async function seg(name, speed, fn, target = page) {
  const rec = await start(target, name);
  const began = Date.now();
  try { await fn(); } catch (error) { await target.screenshot({ path: `${process.env.SHOTS}/fail-${name}.png` }).catch(() => {}); console.log("URL at failure:", target.url().slice(0, 100)); throw error; } finally { await rec.stop(); }
  const entry = { name, speed, seconds: Math.round((Date.now() - began) / 100) / 10 };
  const index = manifest.findIndex((m) => m.name === name);
  if (index >= 0) manifest[index] = entry; else manifest.push(entry);
  save();
  console.log("segment", name, entry.seconds, "s", `x${speed}`);
}
const waitText = (text, timeout = 60000) => page.waitForFunction((t) => document.body.innerText.includes(t), { timeout }, text);

// Start clean: signed out, nothing carried over.
await fetch(`${SITE}/api/v1/paypal/connect/disconnect`, { method: "POST", headers: { Origin: SITE } }).catch(() => {});
await fetch(`${SITE}/api/v1/user/settings`, { method: "POST", headers: { "Content-Type": "application/json", Origin: SITE }, body: JSON.stringify({ profile: { businessName: "", industry: "", city: "", country: "", product: "", contactEmail: "", address: "", borough: "", state: "", currentSupplier: "", invoiceNumber: "", products: [], documentsRead: false }, agentPermissions: { allowAutonomousFilterSort: false, allowAutonomousQuotePrep: false, allowAutonomousDraftMessages: false, allowAutonomousResearch: false, allowAutonomousScheduleChanges: false } }) });
await page.goto(`${SITE}/`, { waitUntil: "networkidle2", timeout: 90000 });
await page.evaluate(() => { try { localStorage.clear(); sessionStorage.clear(); } catch {} });
await page.goto(`${SITE}/`, { waitUntil: "networkidle2", timeout: 90000 });
await sleep(1500);

// 1. Landing: hero, then the problem statement and its sourced numbers.
await seg("a01-landing", 1, async () => {
  await glide(ctx, 1100, 420); await sleep(3500);
  await glide(ctx, 960, 700); await scrollBy(ctx, 880, 2600); await sleep(1500);
  const problem = await page.$("#problem");
  if (problem) { await problem.evaluate((el) => el.scrollIntoView({ block: "start", behavior: "smooth" })); await sleep(1500); }
  await glide(ctx, 700, 520); await sleep(4000);
  await scrollBy(ctx, 380, 2000); await glide(ctx, 1200, 600); await sleep(4500);
});

// 2. Onboarding from documents.
await seg("a02-onboard-open", 1, async () => {
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "smooth" })); await sleep(1500);
  await clickText(ctx, "Use your business"); await sleep(2500);
});
await seg("a03-onboard-documents", 1, async () => {
  await sleep(2500);
  await clickText(ctx, "Use the Neon Dumpling sample");
  await sleep(1500);
});
await seg("a04-onboard-reading", 4, async () => {
  await waitText("I read neon-dumpling-invoice.pdf", 90000);
  await sleep(1000);
});
await seg("a05-onboard-profile", 1, async () => {
  await sleep(4500);
  await glide(ctx, 520, 360); await sleep(2500);
  const input = await page.waitForSelector('input[placeholder^="Answer Mosaic"]', { visible: true });
  await clickHandle(ctx, input);
  await typeHuman(ctx, "1000");
  await page.keyboard.press("Enter");
  await waitText("Connect with PayPal", 30000);
  await sleep(1500);
});

// 3. PayPal connect: real sandbox login.
await seg("a06-paypal-connect", 1, async () => {
  await clickText(ctx, "Connect with PayPal", 500);
  await page.waitForSelector("#email", { timeout: 40000 });
  await sleep(1500);
  await clickSel(ctx, "#email"); await page.type("#email", process.env.PP_EMAIL, { delay: 55 }); await sleep(500);
  await clickText(ctx, "Next");
  await page.waitForSelector("#password", { visible: true, timeout: 30000 });
  await clickSel(ctx, "#password"); await page.type("#password", process.env.PP_PASS, { delay: 55 }); await sleep(600);
  await clickText(ctx, "Log In");
  // PayPal asks for consent the first time only. Wait for either that page or the return to WholeShare.
  await page.waitForFunction(() => location.hostname.includes("wholeshare") || document.querySelector("#agreeConsent"), { timeout: 40000 });
  if (!page.url().includes("wholeshare")) await clickSel(ctx, "#agreeConsent", 900);
  await page.waitForFunction(() => location.hostname.includes("wholeshare"), { timeout: 40000 });
  await sleep(3000);
});
await seg("a07-permissions", 1, async () => {
  await waitText("PayPal is connected", 30000);
  await sleep(3500);
  await clickText(ctx, "Continue", 600);
  await waitText("Choose permissions", 30000);
  await sleep(2500);
  await clickText(ctx, "Choose permissions", 700);
  await sleep(2500);
  // Turn on each of Mosaic's five permissions, one at a time.
  const switches = await page.$$('[role="switch"]');
  for (const toggle of switches) {
    const on = await toggle.evaluate((el) => el.getAttribute("aria-checked") === "true" || el.checked === true);
    const disabled = await toggle.evaluate((el) => el.getAttribute("aria-disabled") === "true" || el.disabled === true);
    if (!on && !disabled) { await clickHandle(ctx, toggle, 250); await sleep(500); }
  }
  await sleep(2500);
  await clickText(ctx, "Continue", 700);
  await sleep(3000);
});
await seg("a08-onboard-finish", 1, async () => {
  await waitText("Confirm and save", 40000);
  await sleep(4500);
  await clickText(ctx, "Confirm and save", 600);
  await waitText("Enter Matchmaking Workspace", 40000);
  await sleep(3500);
  await clickText(ctx, "Enter Matchmaking Workspace", 600);
  await sleep(4000);
});
await browser.close();
