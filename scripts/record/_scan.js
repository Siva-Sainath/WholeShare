import puppeteer from "puppeteer";
const SITE = "https://wholeshare-app.onrender.com";
const b = await puppeteer.launch({ headless: true, args: ["--no-sandbox"], defaultViewport: { width: 1440, height: 900 } });
const p = await b.newPage();
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
await p.goto(`${SITE}/`, { waitUntil: "networkidle2", timeout: 90000 });
await p.evaluate(() => localStorage.setItem("wholeshare_onboarding_confirmed", "true"));
const pattern = /\b(clan-[a-z0-9-]+|claim-[a-z0-9-]+|sme_[a-z0-9_]+|coalition_[a-z0-9_]+|del-[a-z0-9_-]+|[A-Z]{3,}_[A-Z_]{3,})\b/g;
const clickTab = async (t) => { const h = await p.evaluateHandle((t) => [...document.querySelectorAll("button,[role=tab],label,span")].find((e) => (e.textContent || "").trim() === t && e.getBoundingClientRect().width > 0), t); await h.asElement()?.click(); await wait(2500); };
const report = async (name) => { const text = await p.evaluate(() => document.body.innerText); const hits = [...new Set(text.match(pattern) || [])]; console.log(name.padEnd(28), hits.length ? hits.join(" | ") : "clean"); };
for (const [hash, tabs] of [["discover", []], ["my-groups", []], ["disputes", ["Timeline", "Calendar", "Claims board", "Shipments", "Claims", "File a claim"]], ["insights", ["PayPal position", "Demand and savings", "Delivery and claims", "Members"]], ["agents", []], ["settings", []]]) {
  await p.goto(`${SITE}/#${hash}`, { waitUntil: "networkidle2" }); await p.reload({ waitUntil: "networkidle2" }); await wait(4500);
  await report(hash);
  for (const t of tabs) { await clickTab(t); await report(`${hash} / ${t}`); }
}
// open the first claim row's dialog
await p.goto(`${SITE}/#disputes`, { waitUntil: "networkidle2" }); await p.reload({ waitUntil: "networkidle2" }); await wait(4000);
await clickTab("Claims");
const cell = await p.$(".ag-row[row-index=\"0\"] .ag-cell"); if (cell) { await cell.click(); await wait(2500); await report("claim dialog"); await p.screenshot({ path: "/tmp/shots/claim-dialog.png" }); }
await b.close();
