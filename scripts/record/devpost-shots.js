// Takes the gallery images for the project page: 3:2, 1800 by 1200, PNG, well under 5 MB each.
import puppeteer from "puppeteer";
const SITE = "https://wholeshare-app.onrender.com";
const OUT = `${process.env.HOME}/Movies/WholeShare-demo/devpost-images`;
const b = await puppeteer.launch({ headless: true, args: ["--no-sandbox"], defaultViewport: { width: 1500, height: 1000, deviceScaleFactor: 1.2 } });
const p = await b.newPage();
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const shot = async (name) => { await wait(1200); await p.screenshot({ path: `${OUT}/${name}.png` }); console.log("shot", name); };
const clickText = async (t) => { await p.evaluate(() => window.scrollTo(0, 0)); const h = await p.evaluateHandle((t) => [...document.querySelectorAll("button,[role=tab],label,span,a")].find((e) => (e.textContent || "").trim() === t && e.getBoundingClientRect().width > 0), t); const el = h.asElement(); if (el) { await el.click(); await wait(2500); return true; } return false; };
const go = async (hash, ms = 4500) => { await p.goto(`${SITE}/#${hash}`, { waitUntil: "networkidle2" }); await p.reload({ waitUntil: "networkidle2" }); await wait(ms); await p.evaluate(() => { window.scrollTo(0, 0); document.querySelectorAll("main, [data-ws-view]").forEach((el) => { el.scrollTop = 0; }); }); await wait(600); };
const ask = async (prompt, ms = 30000) => { const box = await p.waitForSelector("textarea, [contenteditable=true]", { visible: true }); await box.click(); await p.keyboard.type(prompt); await p.keyboard.press("Enter"); await wait(ms); };

await p.goto(`${SITE}/`, { waitUntil: "networkidle2" });
await p.evaluate(() => { try { localStorage.setItem("wholeshare_onboarding_confirmed", "true"); } catch {} });
await go("");
await p.evaluate(() => { try { localStorage.removeItem("wholeshare_onboarding_confirmed"); } catch {} });
await p.goto(`${SITE}/`, { waitUntil: "networkidle2" }); await wait(3500); await shot("01-landing-hero");
await p.evaluate(() => document.querySelector("#problem")?.scrollIntoView({ block: "start" })); await p.evaluate(() => window.scrollBy(0, -90)); await wait(1500); await shot("02-the-problem-with-sources");
await p.evaluate(() => { try { localStorage.setItem("wholeshare_onboarding_confirmed", "true"); } catch {} });
await go("discover"); await shot("03-discover-groups-with-saving-banner");
await go("group/clan-nyc-containers-garden-state"); await shot("04-group-page-tiers-and-receiving-point");
await go("my-groups"); await shot("05-my-groups-and-escrow");
await go("disputes", 5500); await shot("06-bryntum-delivery-timeline");
await clickText("Calendar"); await shot("07-bryntum-calendar-inspection-windows");
await clickText("Claims board"); await shot("08-bryntum-claims-board");
await clickText("Claims"); await shot("09-claims-ag-grid");
await go("insights", 6000); await shot("10-ag-studio-insights-paypal-position");
await clickText("Delivery and claims"); await shot("11-ag-studio-delivery-and-claims");
await go("agents", 5000); await shot("12-agents-outside-access-and-live-feed");
await go("mosaic-chat", 4000);
await ask("Compare the two takeout container groups for 12 cases", 32000); await shot("13-mosaic-comparison-panel");
await ask("Where is my shipment and when does my inspection window end?", 30000); await shot("14-mosaic-shipments-with-sources");
await go("onboarding", 4000);
{ const h = await p.evaluateHandle(() => [...document.querySelectorAll("button")].find((e) => (e.textContent || "").trim().startsWith("Use the Neon Dumpling sample"))); const el = h.asElement(); if (el) { await el.click(); await wait(16000); } }
await shot("15-onboarding-reads-your-documents");
await b.close();
