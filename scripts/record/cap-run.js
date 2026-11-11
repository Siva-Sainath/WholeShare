// Records the demo in one visible Chrome window with Cap. CLIPS picks which clips to run, for example CLIPS=k1,k2.
// Credentials come from PP_EMAIL and PP_PASS in the environment and are never written to disk.
import { launchHeaded, sleep, glide, clickText, clickSel, clickHandle, byText, typeHuman, scrollBy, fast } from "./lib.js";
import { clip, chromeWindows, startCap, stopCap } from "./cap-lib.js";
import { writeFileSync } from "node:fs";
import { CAP_DIR } from "./cap-lib.js";

const SITE = "https://wholeshare-app.onrender.com";
const want = new Set((process.env.CLIPS || "k1,k2").split(","));
const ctx = await launchHeaded();
const { page } = ctx;
page.on("pageerror", (e) => console.log("PAGEERROR", e.message.slice(0, 160)));
const waitText = (text, timeout = 60000) => page.waitForFunction((t) => document.body.innerText.includes(t), { timeout }, text);
const post = (path, body) => fetch(`${SITE}${path}`, { method: "POST", headers: { "Content-Type": "application/json", Origin: SITE }, body: JSON.stringify(body) }).catch(() => null);

async function cleanState() {
  await post("/api/v1/paypal/connect/disconnect", {});
  await post("/api/v1/user/settings", { profile: { businessName: "", industry: "", city: "", country: "", product: "", contactEmail: "", address: "", borough: "", state: "", currentSupplier: "", invoiceNumber: "", products: [], documentsRead: false }, agentPermissions: { allowAutonomousFilterSort: false, allowAutonomousQuotePrep: false, allowAutonomousDraftMessages: false, allowAutonomousResearch: false, allowAutonomousScheduleChanges: false } });
}

if (want.has("k1") || want.has("k2")) {
  if (want.has("k2")) await cleanState();
  await page.goto(`${SITE}/`, { waitUntil: "networkidle2", timeout: 90000 });
  await page.evaluate(() => { try { localStorage.clear(); sessionStorage.clear(); } catch {} });
  await page.goto(`${SITE}/`, { waitUntil: "networkidle2", timeout: 90000 });
  await sleep(2000);
}

if (want.has("k1")) {
  await clip(ctx, "k1-landing", async () => {
    await glide(ctx, 900, 380); await sleep(3000);
    await glide(ctx, 720, 560); await scrollBy(ctx, 860, 2400); await sleep(1200);
    const problem = await page.$("#problem");
    if (problem) { await problem.evaluate((el) => el.scrollIntoView({ block: "start", behavior: "smooth" })); await sleep(1500); }
    await glide(ctx, 560, 420); await sleep(4500);
    await scrollBy(ctx, 360, 1800); await glide(ctx, 900, 480); await sleep(5000);
  });
}

if (want.has("k2")) {
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "smooth" })); await sleep(1500);
  await clip(ctx, "k2-onboarding", async () => {
    await glide(ctx, 700, 300); await sleep(1200);
    await clickText(ctx, "Use your business"); await sleep(2500);
    await clickText(ctx, "Use the Neon Dumpling sample"); await sleep(1200);
    await fast(ctx, 4, async () => { await waitText("I read neon-dumpling-invoice.pdf", 90000); await sleep(800); });
    await sleep(4500);
    const input = await page.waitForSelector('input[placeholder^="Answer Mosaic"]', { visible: true });
    await clickHandle(ctx, input);
    await typeHuman(ctx, "1000"); await page.keyboard.press("Enter");
    await waitText("Connect with PayPal", 30000); await sleep(1500);
    await clickText(ctx, "Connect with PayPal", 500);
    await fast(ctx, 4, async () => { await page.waitForSelector("#email", { timeout: 40000 }); await sleep(800); });
    await clickSel(ctx, "#email"); await page.type("#email", process.env.PP_EMAIL, { delay: 55 }); await sleep(400);
    await clickText(ctx, "Next");
    await page.waitForSelector("#password", { visible: true, timeout: 30000 });
    await clickSel(ctx, "#password"); await page.type("#password", process.env.PP_PASS, { delay: 55 }); await sleep(500);
    await clickText(ctx, "Log In");
    await fast(ctx, 4, async () => { await page.waitForFunction(() => location.hostname.includes("wholeshare") || document.querySelector("#agreeConsent"), { timeout: 40000 }); });
    if (!page.url().includes("wholeshare")) await clickSel(ctx, "#agreeConsent", 900);
    await page.waitForFunction(() => location.hostname.includes("wholeshare"), { timeout: 40000 });
    await waitText("PayPal is connected", 30000); await sleep(3000);
    await clickText(ctx, "Continue", 600);
    await waitText("Choose permissions", 30000); await sleep(2000);
    await clickText(ctx, "Choose permissions", 700); await sleep(2000);
    for (const toggle of await page.$$('[role="switch"]')) {
      const on = await toggle.evaluate((el) => el.getAttribute("aria-checked") === "true" || el.checked === true);
      const off = await toggle.evaluate((el) => el.getAttribute("aria-disabled") === "true" || el.disabled === true);
      if (!on && !off) { await clickHandle(ctx, toggle, 250); await sleep(450); }
    }
    await sleep(1500);
    await clickText(ctx, "Continue", 700); await waitText("Confirm and save", 40000); await sleep(3500);
    await clickText(ctx, "Confirm and save", 600);
    await waitText("Enter Matchmaking Workspace", 40000); await sleep(2500);
    await clickText(ctx, "Enter Matchmaking Workspace", 600); await sleep(3500);
  });
}

const needsSession = ["k1", "k3", "k4", "k5", "k6"].some((k) => want.has(k)) && !want.has("k2");
if (needsSession) {
  await page.goto(`${SITE}/`, { waitUntil: "networkidle2", timeout: 90000 });
  await page.evaluate(() => localStorage.setItem("wholeshare_onboarding_confirmed", "true"));
}
const go = async (hash) => { await page.evaluate((h) => { location.hash = h; }, hash); await sleep(2500); };

if (want.has("k3")) {
  await go("discover"); await page.reload({ waitUntil: "networkidle2" }); await sleep(2500);
  const mainId = chromeWindows().sort((a, b) => b.bounds.width * b.bounds.height - a.bounds.width * a.bounds.height)[0].id;
  await clip(ctx, "k3-join", async () => {
    await sleep(2500);
    const search = await page.waitForSelector('main input[type="text"], main input[type="search"], main input:not([type])', { visible: true });
    await clickHandle(ctx, search);
    for (let i = 0; i < 30; i += 1) await page.keyboard.press("Backspace");
    await typeHuman(ctx, "takeout containers"); await sleep(3000);
    const card = await page.evaluateHandle(() => [...document.querySelectorAll("*")].filter((el) => /Garden State\)/.test(el.textContent || "") && el.getBoundingClientRect().width > 200 && el.getBoundingClientRect().width < 460 && el.children.length < 10).sort((a, b) => a.getBoundingClientRect().height - b.getBoundingClientRect().height).pop());
    await clickHandle(ctx, card.asElement(), 700);
    await waitText("Garden State Paper & Packaging", 20000); await sleep(3500);
    await glide(ctx, 1000, 300); await sleep(2500);
    await scrollBy(ctx, 330, 2200); await sleep(3500);
    await scrollBy(ctx, 330, 2200); await sleep(3500);
    await scrollBy(ctx, -660, 1800); await sleep(1500);
    await clickHandle(ctx, await page.waitForSelector('input[type="checkbox"]', { visible: true }), 500); await sleep(1400);
    const units = await page.waitForSelector('input[type="number"]', { visible: true });
    await clickHandle(ctx, units, 400); await page.keyboard.press("End"); await typeHuman(ctx, "2"); await sleep(2500);
    await clickText(ctx, "Continue", 500); await sleep(2800);
    await clickText(ctx, "Continue", 500); await sleep(3500);
    const host = await page.waitForSelector(".ws-paypal-button-host", { visible: true, timeout: 30000 });
    await sleep(3500);
    const box = await host.boundingBox();
    const popupPromise = new Promise((resolve) => browser().once("targetcreated", async (t) => resolve(await t.page())));
    await glide(ctx, box.x + box.width / 2, box.y + Math.min(box.height / 2, 28)); await sleep(600);
    ctx.log.push({ k: "click", t: Date.now(), x: box.x + box.width / 2, y: box.y + 28 });
    await page.mouse.down(); await sleep(70); await page.mouse.up();
    ctx.popup = await Promise.race([popupPromise, sleep(20000).then(() => null)]);
    await sleep(1500);
  }, mainId);
  function browser() { return ctx.browser; }
  if (!ctx.popup) throw new Error("PayPal checkout window did not open");
  const popup = ctx.popup;
  await popup.evaluate(() => 0).catch(() => {});
  await sleep(1500);
  const popupId = chromeWindows().filter((w) => w.id !== mainId).sort((a, b) => Number(b.id) - Number(a.id))[0]?.id;
  const rec = await startCap("k3p-paypal-approval", popupId);
  const began = Date.now();
  try {
    await popup.waitForSelector("#email", { visible: true, timeout: 40000 }); await sleep(2000);
    await popup.type("#email", process.env.PP_EMAIL, { delay: 60 }); await sleep(500);
    // PayPal shows either one page with both fields or email first and then the password.
    const passwordShown = await popup.waitForSelector("#password", { visible: true, timeout: 3500 }).catch(() => null);
    if (!passwordShown) { await popup.click("#btnNext").catch(async () => { await (await byText(popup, "Next")).click(); }); await popup.waitForSelector("#password", { visible: true, timeout: 30000 }); }
    await sleep(600);
    await popup.type("#password", process.env.PP_PASS, { delay: 60 }); await sleep(700);
    await popup.click("#btnLogin").catch(async () => { await (await byText(popup, "Log In")).click(); });
    await sleep(8000);
    for (let i = 0; i < 6 && !popup.isClosed(); i += 1) {
      const handle = await popup.evaluateHandle(() => [...document.querySelectorAll("button, input[type=submit]")].find((el) => /(complete purchase|agree and continue|continue|pay now|authorize|save and continue|agree)/i.test((el.value || el.textContent || "").trim())));
      const el = handle.asElement();
      if (!el) { await sleep(2500); continue; }
      await sleep(2500); await el.click().catch(() => {}); await sleep(6000);
    }
  } finally { stopCap(rec); }
  writeFileSync(`${CAP_DIR}/k3p-paypal-approval.events.json`, JSON.stringify({ t0: rec.t0, t1: rec.t1, vp: { w: 1280, h: 800 }, log: [] }));
  console.log("clip k3p", ((Date.now() - began) / 1000).toFixed(1), "s");
  await clip(ctx, "k3r-receipt", async () => { await waitText("Open My groups", 40000); await sleep(5000); }, mainId);
}

if (want.has("k4")) {
  const invite = await (await post("/api/v1/agent-invites", { createdBy: "Instinct" })).json();
  await go("my-groups"); await sleep(1500);
  await clip(ctx, "k4-tour", async () => {
    await glide(ctx, 700, 400); await sleep(5500);
    await scrollBy(ctx, 380, 2000); await sleep(4500);
    await go("disputes"); await glide(ctx, 640, 480); await sleep(3500);
    await clickText(ctx, "Zoom in", 400).catch(() => {}); await sleep(1800);
    const bar = await page.$(".b-sch-event"); if (bar) { await clickHandle(ctx, bar, 500); await sleep(3500); await page.keyboard.press("Escape"); await sleep(800); }
    await clickText(ctx, "Calendar", 500); await sleep(3500);
    await clickText(ctx, "Agenda", 500).catch(() => {}); await sleep(3500);
    await clickText(ctx, "Claims board", 500); await sleep(5000);
    await clickText(ctx, "Claims", 500).catch(() => {}); await sleep(2500);
    const head = await byText(page, "Claim value", "div,span").catch(() => null); if (head) { await clickHandle(ctx, head, 400); await sleep(2500); }
    await go("insights"); await glide(ctx, 700, 460); await sleep(4500);
    await clickText(ctx, "Demand and savings", 500).catch(() => {}); await sleep(4000);
    await clickText(ctx, "Delivery and claims", 500).catch(() => {}); await sleep(4000);
    await go("agents"); await glide(ctx, 700, 460); await sleep(5000);
    const ask = fetch(`${SITE}/api/v1/agent/${invite.token}/ask?q=${encodeURIComponent("Which clear cup groups can we still join?")}`).then((r) => r.json()).catch(() => null);
    await sleep(2500); await scrollBy(ctx, 260, 1400); await ask; await sleep(6000);
  });
}

if (want.has("k5")) {
  const composer = () => page.waitForSelector('textarea, [contenteditable="true"]', { visible: true, timeout: 30000 });
  const askMosaic = async (prompt, { quiet = 7000, max = 90000 } = {}) => {
    await clickHandle(ctx, await composer(), 400);
    await typeHuman(ctx, prompt, 38); await sleep(700);
    await page.keyboard.press("Enter");
    await fast(ctx, 4, async () => {
      const began = Date.now(); let last = -1, stable = Date.now();
      while (Date.now() - began < max) {
        const size = await page.evaluate(() => (document.querySelector(".ws-chat-thread")?.innerText || "").length);
        if (size !== last) { last = size; stable = Date.now(); }
        if (Date.now() - stable > quiet && Date.now() - began > 4000) break;
        await sleep(500);
      }
    });
    await sleep(4500);
  };
  // An outside agent's request can move the page by itself, so make sure the chat is really open before recording.
  for (let attempt = 0; attempt < 4; attempt += 1) {
    await go("mosaic-chat"); await sleep(2500);
    if (await page.$('textarea, [contenteditable="true"]')) break;
    await page.reload({ waitUntil: "networkidle2" });
  }
  const dockClose = await byText(page, "Close").catch(() => null);
  if (dockClose) { await dockClose.click().catch(() => {}); await sleep(1000); }
  await clip(ctx, "k5-mosaic", async () => {
    await glide(ctx, 720, 440); await sleep(4000);
    await askMosaic("Compare the two takeout container groups for 12 cases");
    await askMosaic("Sort that by delivery time", { max: 60000, quiet: 6000 });
    await askMosaic("Where is my shipment and when does my inspection window end?");
    await askMosaic("Move the Garden State container delivery up one day");
    await askMosaic("Find new suppliers for wide boba straws near New York", { max: 100000, quiet: 9000 });
    await askMosaic("Start a group buy for wide boba straws, 8 cases, delivered to our back door on Bedford Avenue and to Cloud Nine Boba on Court Street", { max: 120000, quiet: 9000 });
    await sleep(6000);
  });
}

if (want.has("k6")) {
  await go("disputes");
  const dock = await byText(page, "Close").catch(() => null);
  if (dock) { await dock.click().catch(() => {}); await sleep(1200); }
  await clip(ctx, "k6-dispute", async () => {
    await glide(ctx, 700, 420); await sleep(2500);
    await clickText(ctx, "File a claim", 500); await sleep(2500);
    const box = await page.waitForSelector("textarea", { visible: true });
    await clickHandle(ctx, box, 400);
    await typeHuman(ctx, "3 of the 8 cases from Eastern arrived crushed at the corners", 35); await sleep(800);
    await clickText(ctx, "Fill the form with Mosaic", 500);
    await fast(ctx, 3, async () => { await sleep(6000); await page.waitForFunction(() => !/Reading/.test(document.body.innerText), { timeout: 40000 }).catch(() => {}); });
    await sleep(2500);
    // Pick the delivered shipment from the list, then add the unit price and a contact email.
    const select = await page.evaluateHandle(() => [...document.querySelectorAll("button,[role=combobox],div")].filter((el) => /Choose the shipment that arrived damaged/.test(el.textContent || "") && el.getBoundingClientRect().height < 80 && el.getBoundingClientRect().width > 150).sort((a, b) => a.getBoundingClientRect().height - b.getBoundingClientRect().height)[0]);
    if (select.asElement()) { await clickHandle(ctx, select.asElement(), 500); await sleep(1500);
      const option = await page.evaluateHandle(() => { const items = [...document.querySelectorAll("[role=option],li")].filter((el) => el.getBoundingClientRect().height > 0); return items.find((el) => /eastern|delivered/i.test(el.textContent || "")) || items[0] || null; });
      if (option.asElement()) { await clickHandle(ctx, option.asElement(), 500); await sleep(1500); } }
    const price = await page.$('input[type="number"][aria-label*="Unit price"], input[aria-label*="Unit price"]');
    if (price) { await clickHandle(ctx, price, 400); await typeHuman(ctx, "22.88", 50); await sleep(600); }
    const email = await page.$('input[type="email"]');
    if (email) { await clickHandle(ctx, email, 400); await typeHuman(ctx, "accounts@neondumpling.example", 35); await sleep(800); }
    const file = await page.$('input[type="file"]');
    if (file) await file.uploadFile(`${process.env.HOME}/Documents/Paypal_project/src/web/public/demo-kits/photos/damaged-parcel-crushed.jpg`);
    await sleep(3000);
    await scrollBy(ctx, 380, 1800); await sleep(2000);
    await clickText(ctx, "Submit damage claim", 600);
    await sleep(4500);
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: "smooth" })); await sleep(1500);
    await clickText(ctx, "Claims board", 500); await sleep(3500);
    const card = await page.evaluateHandle(() => { const cards = [...document.querySelectorAll(".b-taskboard-card, [class*='b-task-board-card'], .b-card")].filter((el) => el.getBoundingClientRect().width > 80); return cards.sort((a, b) => a.getBoundingClientRect().left - b.getBoundingClientRect().left)[0] || null; });
    if (card.asElement()) await clickHandle(ctx, card.asElement(), 600);
    await sleep(2500);
    await clickText(ctx, "Approve and send to supplier", 600); await sleep(3500);
    await clickText(ctx, "Supplier accepts", 600); await sleep(5000);
  });
}
await ctx.browser.close();
