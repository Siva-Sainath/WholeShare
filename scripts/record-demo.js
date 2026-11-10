// Plays the demo story in a real Chrome page over the DevTools protocol and records each beat to a webm file.
// One file per beat, so a bad take is re-recorded on its own. Money steps are never automated: the join beat
// stops when the PayPal approval drawer opens, so a person approves it in the sandbox.
//
// Usage: node scripts/record-demo.js [--base=http://localhost:3000] [--beat=compare] [--out=docs/assets/demo] [--connect=http://127.0.0.1:9222] [--fast]
//   --connect attaches to a Chrome you started with --remote-debugging-port=9222. Without it a new Chrome is launched.
//   --fast types instantly (for checking a beat). Default types at a human pace.
import puppeteer from "puppeteer";
import { mkdirSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const arg = (name, fallback) => (process.argv.find((a) => a.startsWith(`--${name}=`)) || "").split("=").slice(1).join("=") || fallback;
const BASE = arg("base", "http://localhost:3000");
const OUT = resolve(process.cwd(), arg("out", "docs/assets/demo"));
const ONLY = arg("beat", "");
const CONNECT = arg("connect", "");
const FAST = process.argv.includes("--fast");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
mkdirSync(OUT, { recursive: true });

const BEATS = [
  { id: "01-find", prompt: "Which takeout container groups in Flushing can we still join?", hold: 3000 },
  { id: "02-compare", prompt: "Compare the two Flushing takeout container groups for 12 cases", hold: 4000 },
  { id: "03-join", prompt: "Join the Garden State container group with 12 cases", hold: 2500, stopAt: "pledge-drawer" },
  { id: "04-start-group", prompt: "Start a jasmine rice group with my neighbour Lucky Panda, delivered to our two back doors at 135-20 Roosevelt Ave and 41-12 Main St in Flushing, 120 bags", hold: 3500 },
  { id: "05-delivery", prompt: "Move the container delivery up a day", hold: 3000 },
  { id: "05b-undo", prompt: "Undo that", hold: 2500 },
  { id: "06-dispute", prompt: "Our delivered containers arrived crushed, 8 cartons, file a claim", attach: "src/web/public/img/products/boxes.jpg", hold: 4000 }
];

async function typeLikeAPerson(page, text) {
  if (FAST) { await page.keyboard.type(text); return; }
  for (const character of text) { await page.keyboard.type(character); await sleep(22 + Math.random() * 30); }
}

async function waitForAnswer(page, beforeCount) {
  await page.waitForFunction((n) => document.querySelectorAll("[data-msg-id]").length >= n + 2, { timeout: 120000 }, beforeCount);
  // Quiet for a moment: no running tool rows and no "working" toast.
  let calm = 0;
  while (calm < 4) {
    const busy = await page.evaluate(() => Boolean(document.querySelector(".ws-trace-row.is-running")) || /Mosaic is working/.test(document.body.innerText));
    calm = busy ? 0 : calm + 1;
    await sleep(400);
  }
}

const browser = CONNECT
  ? await puppeteer.connect({ browserURL: CONNECT, defaultViewport: null })
  : await puppeteer.launch({ headless: "new", defaultViewport: { width: 1600, height: 900 }, args: ["--no-sandbox", "--window-size=1600,900"] });
const page = await browser.newPage();
await page.setViewport({ width: 1600, height: 900 });
await page.evaluateOnNewDocument(() => localStorage.setItem("wholeshare_onboarding_confirmed", "true"));
await page.goto(`${BASE}/#mosaic-chat`, { waitUntil: "networkidle2" });
await sleep(1500);

const summary = [];
for (const beat of BEATS) {
  if (ONLY && !beat.id.includes(ONLY)) continue;
  const file = resolve(OUT, `${beat.id}.webm`);
  const recorder = await page.screencast({ path: file });
  const started = Date.now();
  try {
    const before = await page.evaluate(() => document.querySelectorAll("[data-msg-id]").length);
    if (beat.attach && existsSync(resolve(process.cwd(), beat.attach))) {
      const input = await page.$('input[type="file"]');
      if (input) { await input.uploadFile(resolve(process.cwd(), beat.attach)); await sleep(2500); }
    }
    await page.click("textarea, [contenteditable=true], [role=textbox]");
    await typeLikeAPerson(page, beat.prompt);
    await sleep(400);
    await page.keyboard.press("Enter");
    if (beat.stopAt === "pledge-drawer") {
      await page.waitForFunction(() => /Approve authorization hold with PayPal/.test(document.body.innerText), { timeout: 120000 });
    } else {
      await waitForAnswer(page, before);
    }
    await sleep(beat.hold);
    summary.push(`${beat.id}: ${Math.round((Date.now() - started) / 1000)} s`);
  } catch (error) {
    summary.push(`${beat.id}: FAILED ${error.message.slice(0, 80)}`);
  } finally {
    await recorder.stop();
  }
  if (beat.stopAt === "pledge-drawer") {
    await page.keyboard.press("Escape");
    await sleep(600);
  }
}
console.log(summary.join("\n"));
if (CONNECT) await page.close(); else await browser.close();
