// Clicks every visible control on every screen and fails when one does nothing.
// Money moving, destructive and external controls are skipped on purpose.
import puppeteer from "puppeteer";

const BASE = process.env.BASE_URL || "http://localhost:3000";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ALL_VIEWS = ["discover", "group/clan-austin-specialty-grade-002", "my-groups", "mygroup/coalition_boxes_04", "disputes", "paypal", "agents", "settings", "mosaic-chat"];
const VIEWS = process.env.VIEWS ? process.env.VIEWS.split(",") : ALL_VIEWS;
(async () => {
  const b = await puppeteer.launch({ headless: "new", args: ["--no-sandbox"] });
  const report = [];
  for (const view of VIEWS) {
    const p = await b.newPage(); await p.setViewport({ width: 1440, height: 900 });
    const reqs = []; const errs = [];
    p.on("request", r => { if (/\/api\//.test(r.url()) && r.method() !== "GET") reqs.push(r.method() + " " + r.url().replace(BASE, "")); else if (/\/api\//.test(r.url())) reqs.push("GET " + r.url().replace(BASE, "").split("?")[0]); });
    p.on("pageerror", e => errs.push(e.message));
    p.on("dialog", d => d.dismiss().catch(() => {}));
    await p.evaluateOnNewDocument(() => localStorage.setItem("wholeshare_onboarding_confirmed", "true"));
    await p.goto(`${BASE}/#` + view, { waitUntil: "networkidle2" });
    await sleep(2500);
    const labels = await p.evaluate(() => {
      const els = [...document.querySelectorAll("main button, main a[href], main [role=tab], main [role=radio], header button")]
        .filter(e => !e.closest(".ag-root-wrapper, .b-widget, .ag-studio, [class*=b-]") && e.offsetParent !== null && !e.disabled);
      return [...new Set(els.map(e => (e.innerText || e.getAttribute("aria-label") || "").trim().replace(/\s+/g, " ")).filter(Boolean))].slice(0, 40);
    });
    for (const label of labels) {
      if (view === "settings" && /Local record/.test(label)) { report.push({ view, label, result: "SKIPPED (identity opens Settings, already here)" }); continue; }
      if (/^(Photo of|Attach|Choose file)|Scroll to bottom/i.test(label)) { report.push({ view, label, result: "SKIPPED (file picker or scroll helper)" }); continue; }
      if (/Submit damage claim|Continue with PayPal|Connect with PayPal|Authorize|Capture|Reset|Delete|Revoke|Disconnect|Check and release|Leave group|Settle|Confirm delivery|Create invoice|Create plan|Send reminder|Approve and send/i.test(label)) { report.push({ view, label, result: "SKIPPED (money or destructive)" }); continue; }
      const before = await p.evaluate(() => ({ h: location.hash, len: document.body.innerText.length, html: document.body.innerHTML.length, y: Math.round(window.scrollY), vals: [...document.querySelectorAll("input,textarea,select")].map((e) => e.value).join("|") + [...document.querySelectorAll("[contenteditable=true],[role=textbox]")].map((e) => e.textContent).join("|"), sel: document.querySelectorAll("[aria-selected=true],[aria-checked=true],[aria-pressed=true],.is-active").length }));
      reqs.length = 0; errs.length = 0;
      const clicked = await p.evaluate((label) => {
        const els = [...document.querySelectorAll("main button, main a[href], main [role=tab], main [role=radio], header button")].filter(e => !e.closest(".ag-root-wrapper, .b-widget, .ag-studio, [class*=b-]") && e.offsetParent !== null);
        const el = els.find(e => ((e.innerText || e.getAttribute("aria-label") || "").trim().replace(/\s+/g, " ")) === label);
        if (!el) return false;
        const active = el.getAttribute("aria-current") === "page" || el.getAttribute("aria-selected") === "true" || el.getAttribute("aria-checked") === "true" || el.classList.contains("is-active") || el.closest("[aria-current=page]") !== null;
        if (active) return "active";
        el.click(); return true;
      }, label);
      await sleep(900);
      const after = await p.evaluate(() => ({ h: location.hash, len: document.body.innerText.length, html: document.body.innerHTML.length, y: Math.round(window.scrollY), vals: [...document.querySelectorAll("input,textarea,select")].map((e) => e.value).join("|") + [...document.querySelectorAll("[contenteditable=true],[role=textbox]")].map((e) => e.textContent).join("|"), sel: document.querySelectorAll("[aria-selected=true],[aria-checked=true],[aria-pressed=true],.is-active").length }));
      const changed = before.h !== after.h || Math.abs(before.html - after.html) > 20 || Math.abs(before.len - after.len) > 3 || Math.abs(before.y - after.y) > 20 || before.vals !== after.vals || before.sel !== after.sel;
      const net = [...new Set(reqs)].filter(x => !/mcp\/tools|events/.test(x));
      if (clicked === "active") { report.push({ view, label, result: "SKIPPED (already the active choice)" }); continue; }
      report.push({ view, label, clicked, urlChange: before.h !== after.h ? after.h : "", domChange: changed, network: net.slice(0, 3), errors: errs.slice(0, 1) });
      if (before.h !== after.h) { await p.goto(`${BASE}/#` + view, { waitUntil: "networkidle2" }); await sleep(1200); }
    }
    await p.close();
  }
  await b.close();
  const useless = report.filter(r => r.clicked && !r.domChange && !(r.network || []).length && !r.urlChange);
  console.log("TOTAL", report.length, "NO VISIBLE EFFECT", useless.length);
  console.log("--- no effect:"); useless.forEach(r => console.log(`  [${r.view}] ${r.label}`));
  console.log("--- errors:"); report.filter(r => r.errors && r.errors.length).forEach(r => console.log(`  [${r.view}] ${r.label}: ${r.errors[0]}`));
  console.log("--- hit backend:"); report.filter(r => (r.network || []).length).forEach(r => console.log(`  [${r.view}] ${r.label} -> ${r.network.join(", ")}`));
  if (useless.length) process.exitCode = 1;
  console.log("--- skipped:"); report.filter(r => /SKIPPED/.test(r.result || "")).forEach(r => console.log(`  [${r.view}] ${r.label}`));
})();
