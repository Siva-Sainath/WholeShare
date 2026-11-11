// Stage B: discover, group page tour and the PayPal pledge approval, after stage A has onboarded Neon Dumpling.
import { writeFileSync, readFileSync, existsSync } from "node:fs";
import { launch, start, sleep, glide, clickText, clickSel, clickHandle, byText, typeHuman, scrollBy, OUT } from "./lib.js";

const SITE = "https://wholeshare-app.onrender.com";
const manifestPath = `${OUT}/manifest.json`;
const manifest = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, "utf8")) : [];
const save = () => writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
const ctx = await launch();
const { page, browser } = ctx;
page.on("pageerror", (e) => console.log("PAGEERROR", e.message.slice(0, 160)));

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
const waitText = (text, timeout = 60000, p = page) => p.waitForFunction((t) => document.body.innerText.includes(t), { timeout }, text);

await page.goto(`${SITE}/`, { waitUntil: "networkidle2", timeout: 90000 });
await page.evaluate(() => localStorage.setItem("wholeshare_onboarding_confirmed", "true"));
await page.goto(`${SITE}/#discover`, { waitUntil: "networkidle2" });
await page.reload({ waitUntil: "networkidle2" });
await sleep(2500);

await seg("b01-discover", 1, async () => {
  await sleep(3500);
  const search = await page.waitForSelector('main input[type="text"], main input[type="search"], main input:not([type])', { visible: true });
  await clickHandle(ctx, search);
  await page.keyboard.down("Meta"); await page.keyboard.press("a"); await page.keyboard.up("Meta");
  await typeHuman(ctx, "takeout containers");
  await sleep(3500);
  const card = await byText(page, "New York Takeout Containers 32 oz (Garden", "article, [role=button], div");
  await glide(ctx, 900, 640); await sleep(3000);
});
await seg("b02-group", 1, async () => {
  const card = await page.evaluateHandle(() => [...document.querySelectorAll("*")].filter((el) => el.children.length < 8 && /Garden State\)/.test(el.textContent || "") && el.getBoundingClientRect().width > 200 && el.getBoundingClientRect().width < 500).sort((a, b) => a.getBoundingClientRect().height - b.getBoundingClientRect().height).pop());
  await clickHandle(ctx, card.asElement(), 600);
  await waitText("Garden State Paper & Packaging", 20000);
  await sleep(3500);
  await glide(ctx, 1200, 400); await sleep(2500);
  await scrollBy(ctx, 380, 2200); await sleep(3000);
  await scrollBy(ctx, 380, 2200); await sleep(3000);
  await scrollBy(ctx, -760, 1800); await sleep(1500);
});
await seg("b03-pledge-form", 1, async () => {
  const rules = await page.waitForSelector('input[type="checkbox"]', { visible: true });
  await clickHandle(ctx, rules, 500);
  await sleep(1500);
  const units = await page.waitForSelector('input[type="number"]', { visible: true });
  await clickHandle(ctx, units, 400);
  await page.keyboard.press("End");
  await typeHuman(ctx, "2");
  await sleep(2500);
  await clickText(ctx, "Continue", 500); await sleep(3000);
  await clickText(ctx, "Continue", 500); await sleep(4000);
});

// The PayPal checkout opens in a popup window. It is recorded as its own segment.
const popupPromise = new Promise((resolve) => browser.once("targetcreated", async (target) => { const p = await target.page(); resolve(p); }));
await seg("b04-click-paypal", 1, async () => {
  const host = await page.waitForSelector(".ws-paypal-button-host", { visible: true, timeout: 30000 });
  await sleep(4000);
  const box = await host.boundingBox();
  await glide(ctx, box.x + box.width / 2, box.y + Math.min(box.height / 2, 28));
  await sleep(600);
  await page.mouse.down(); await sleep(70); await page.mouse.up();
  await sleep(1500);
});
const popup = await Promise.race([popupPromise, sleep(20000).then(() => null)]);
if (!popup) { await page.screenshot({ path: `${process.env.SHOTS}/fail-popup.png` }); throw new Error("PayPal checkout window did not open"); }
await popup.setViewport({ width: 1280, height: 900 });
await popup.evaluate(() => 0).catch(() => {});
await seg("b05-paypal-approval", 1, async () => {
  await popup.waitForSelector("#email", { timeout: 40000 });
  await sleep(1500);
  await popup.type("#email", process.env.PP_EMAIL, { delay: 55 });
  await popup.click("#btnNext").catch(async () => { const next = await byText(popup, "Next"); await next.click(); });
  await popup.waitForSelector("#password", { visible: true, timeout: 30000 });
  await popup.type("#password", process.env.PP_PASS, { delay: 55 });
  await popup.click("#btnLogin").catch(async () => { const login = await byText(popup, "Log In"); await login.click(); });
  await sleep(9000);
  for (let i = 0; i < 6 && !popup.isClosed(); i += 1) {
    const button = await popup.evaluateHandle(() => [...document.querySelectorAll("button, input[type=submit]")].find((el) => /(complete purchase|agree and continue|continue|pay now|authorize|save and continue|agree)/i.test((el.value || el.textContent || "").trim())));
    const el = button.asElement();
    if (!el) { await sleep(2500); continue; }
    await sleep(2500);
    await el.click().catch(() => {});
    await sleep(6000);
  }
}, popup);
await sleep(2000);
await seg("b06-receipt", 1, async () => {
  await waitText("Open My groups", 40000);
  await sleep(4500);
  console.log((await page.evaluate(() => document.querySelector("main")?.innerText)).slice(-500).replace(/\n+/g, " | "));
});
await browser.close();
