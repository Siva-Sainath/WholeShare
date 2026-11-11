// Stage C: tour of each page, an outside agent using the invite link, Mosaic prompts, and the dispute process.
import { writeFileSync, readFileSync, existsSync } from "node:fs";
import { launch, start, sleep, glide, clickText, clickSel, clickHandle, byText, typeHuman, scrollBy, OUT } from "./lib.js";

const SITE = "https://wholeshare-app.onrender.com";
const manifestPath = `${OUT}/manifest.json`;
const manifest = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, "utf8")) : [];
const save = () => writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
const only = process.env.ONLY ? process.env.ONLY.split(",") : null;
const ctx = await launch();
const { page, browser } = ctx;
page.on("pageerror", (e) => console.log("PAGEERROR", e.message.slice(0, 160)));

async function seg(name, speed, fn) {
  if (only && !only.includes(name.slice(0, 3))) return;
  const rec = await start(page, name);
  const began = Date.now();
  try { await fn(); } catch (error) { await page.screenshot({ path: `${process.env.SHOTS}/fail-${name}.png` }).catch(() => {}); console.log("FAILED", name, error.message.slice(0, 160)); await rec.stop(); throw error; }
  await rec.stop();
  const entry = { name, speed, seconds: Math.round((Date.now() - began) / 100) / 10 };
  const index = manifest.findIndex((m) => m.name === name);
  if (index >= 0) manifest[index] = entry; else manifest.push(entry);
  save();
  console.log("segment", name, entry.seconds, "s", `x${speed}`);
}
const go = async (hash) => { await page.evaluate((h) => { location.hash = h; }, hash); await sleep(2500); };
const waitText = (text, timeout = 60000) => page.waitForFunction((t) => document.body.innerText.includes(t), { timeout }, text);

await page.goto(`${SITE}/`, { waitUntil: "networkidle2", timeout: 90000 });
await page.evaluate(() => localStorage.setItem("wholeshare_onboarding_confirmed", "true"));
await page.goto(`${SITE}/#my-groups`, { waitUntil: "networkidle2" });
await page.reload({ waitUntil: "networkidle2" });
await sleep(3000);

await seg("c01-my-groups", 1, async () => {
  await glide(ctx, 900, 400); await sleep(5000);
  await scrollBy(ctx, 420, 2200); await sleep(5000);
  await scrollBy(ctx, -420, 1500); await sleep(1500);
});
await seg("c02-disputes-tour", 1, async () => {
  await go("disputes"); await glide(ctx, 800, 520); await sleep(6000);
  await clickText(ctx, "Calendar", 500); await sleep(5500);
  await clickText(ctx, "Claims board", 500); await sleep(5500);
  await clickText(ctx, "Shipments", 500); await sleep(5000);
});
await seg("c03-insights", 1, async () => {
  await go("insights"); await glide(ctx, 900, 500); await sleep(8000);
  await scrollBy(ctx, 500, 2400); await sleep(5000);
});
await seg("c04-agents", 1, async () => {
  const invite = await (await fetch(`${SITE}/api/v1/agent-invites`, { method: "POST", headers: { "Content-Type": "application/json", Origin: SITE }, body: JSON.stringify({ createdBy: "Instinct" }) })).json();
  await go("agents"); await glide(ctx, 900, 500); await sleep(6000);
  // An outside assistant asks WholeShare through the invite link while the page is open.
  const ask = fetch(`${SITE}/api/v1/agent/${invite.token}/ask?q=${encodeURIComponent("Which clear cup groups can we still join?")}`).then((r) => r.json()).catch(() => null);
  await sleep(2500);
  await scrollBy(ctx, 300, 1500);
  await ask; await sleep(6000);
});

const composer = async () => page.waitForSelector('textarea, [contenteditable="true"]', { visible: true, timeout: 30000 });
async function askMosaic(prompt, { quiet = 7000, max = 90000 } = {}) {
  const box = await composer();
  await clickHandle(ctx, box, 400);
  await typeHuman(ctx, prompt, 38);
  await sleep(700);
  await page.keyboard.press("Enter");
  const began = Date.now();
  let last = -1, stableSince = Date.now();
  while (Date.now() - began < max) {
    const size = await page.evaluate(() => (document.querySelector(".ws-chat-thread")?.innerText || "").length);
    if (size !== last) { last = size; stableSince = Date.now(); }
    if (Date.now() - stableSince > quiet && Date.now() - began > 4000) break;
    await sleep(500);
  }
}

await seg("c05-mosaic-open", 1, async () => {
  await go("mosaic-chat"); await glide(ctx, 960, 500); await sleep(5000);
});
await seg("c06-mosaic-compare", 1, async () => {
  await askMosaic("Compare the two takeout container groups for 12 cases");
  await sleep(6000);
});
await seg("c07-mosaic-suppliers", 1, async () => {
  await askMosaic("Start a group buy for wide boba straws, 8 cases, delivered to our back door on Bedford Avenue and to Cloud Nine Boba on Court Street", { max: 120000, quiet: 9000 });
  await sleep(6000);
});
await seg("c08-mosaic-shipment", 1, async () => {
  await go("mosaic-chat"); await sleep(1500);
  await askMosaic("Where is my shipment and when does my inspection window end?");
  await sleep(5000);
});
await seg("c09-mosaic-schedule", 1, async () => {
  await askMosaic("Move the Garden State container delivery up one day");
  await sleep(5000);
});
await browser.close();
