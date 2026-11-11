// Loads every screen at desktop and phone widths and fails on layout and content errors a person would notice.
// Checks: page and console errors, horizontal page scroll, controls clipped by a parent, overlapping controls,
// broken images, "undefined"/"NaN" text, test data leaking into the UI, and failed API calls.
// Usage: node scripts/verify-ui-layout.js [--shots=dir] [--views=a,b]
import puppeteer from "puppeteer";
import fs from "node:fs";

const BASE = process.env.BASE_URL || "http://localhost:3000";
const arg = (name) => (process.argv.find((a) => a.startsWith(`--${name}=`)) || "").split("=")[1];
const shotsDir = arg("shots");
const VIEWS = (arg("views") || "discover,group/clan-austin-specialty-grade-002,my-groups,mygroup/coalition_boxes_04,disputes,insights,agents,settings,mosaic-chat,paypal").split(",");
const SIZES = [{ name: "desktop", width: 1440, height: 900 }, { name: "laptop", width: 1180, height: 720 }, ...(process.argv.includes("--phone") ? [{ name: "phone", width: 390, height: 844 }] : [])];
const BAD_TEXT = /\b(undefined|NaN|\[object Object\]|null)\b|@example\.com|@wholeshare\.local|lorem ipsum|TODO|\bQwen\b|WebMCP/i;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
if (shotsDir) fs.mkdirSync(shotsDir, { recursive: true });

const inspect = () => {
  const out = [];
  const visible = (el) => { const r = el.getBoundingClientRect(); const st = getComputedStyle(el); return r.width > 2 && r.height > 2 && st.visibility !== "hidden" && st.display !== "none" && st.opacity !== "0"; };
  const label = (el) => ((el.innerText || el.getAttribute("aria-label") || el.tagName).trim().replace(/\s+/g, " ").slice(0, 40));
  const root = document.scrollingElement;
  if (root.scrollWidth > root.clientWidth + 2) out.push({ kind: "page-scrolls-sideways", detail: `${root.scrollWidth}px wide in a ${root.clientWidth}px window` });
  const skip = ".ag-root-wrapper, .b-widget, .b-grid, [class*='b-'], .ag-studio, canvas, svg";
  // Controls cut off by an ancestor that clips overflow.
  for (const el of document.querySelectorAll("button, a[href], input, select, textarea, [role=tab], [role=button]")) {
    if (!visible(el) || el.closest(skip)) continue;
    const r = el.getBoundingClientRect();
    for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
      const st = getComputedStyle(p);
      if (!/(hidden|clip)/.test(st.overflowX + st.overflowY)) continue;
      const pr = p.getBoundingClientRect();
      if (r.right > pr.right + 3 || r.left < pr.left - 3) { out.push({ kind: "control-clipped", detail: `${label(el)} sticks out of its container by ${Math.round(Math.max(r.right - pr.right, pr.left - r.left))}px` }); break; }
    }
    if (r.right > window.innerWidth + 2 || r.left < -2) out.push({ kind: "control-off-screen", detail: label(el) });
  }
  // Two controls drawn on top of each other.
  // The floating Ask Mosaic bar sits above the page by design, and the page keeps room below its content for it.
  const controls = [...document.querySelectorAll("button, a[href], input, select, textarea")].filter((el) => visible(el) && !el.closest(skip) && !el.closest("[hidden]") && !el.closest(".ws-fab") && !el.classList.contains("ws-fab"));
  const rects = controls.map((el) => ({ el, r: el.getBoundingClientRect() }));
  for (let i = 0; i < rects.length; i += 1) for (let j = i + 1; j < rects.length; j += 1) {
    const a = rects[i], b = rects[j];
    if (a.el.contains(b.el) || b.el.contains(a.el)) continue;
    const w = Math.min(a.r.right, b.r.right) - Math.max(a.r.left, b.r.left);
    const h = Math.min(a.r.bottom, b.r.bottom) - Math.max(a.r.top, b.r.top);
    if (w > 6 && h > 6 && w * h > 0.08 * Math.min(a.r.width * a.r.height, b.r.width * b.r.height)) out.push({ kind: "controls-overlap", detail: `${label(a.el)} / ${label(b.el)}` });
  }
  // Headings and buttons whose text is cut with an ellipsis (a card title is fine, a button label is not).
  for (const el of document.querySelectorAll("button, h1, h2")) {
    if (!visible(el) || el.closest(skip)) continue;
    if (el.scrollWidth > el.clientWidth + 2 && /(ellipsis|clip)/.test(getComputedStyle(el).textOverflow + getComputedStyle(el).overflow)) out.push({ kind: "label-truncated", detail: label(el) });
  }
  for (const img of document.images) if (visible(img) && img.complete && img.naturalWidth === 0) out.push({ kind: "broken-image", detail: (img.getAttribute("src") || "").slice(0, 80) });
  const body = document.body.innerText;
  const bad = body.match(/.{0,30}(\bundefined\b|\bNaN\b|\[object Object\]|\bnull\b|@example\.com|@wholeshare\.local|lorem ipsum|\bQwen\b|WebMCP).{0,20}/i);
  if (bad) out.push({ kind: "bad-text", detail: bad[0].replace(/\s+/g, " ") });
  const over = body.match(/\b(\d[\d,]*) of (\d[\d,]*) units/g) || [];
  for (const text of over) { const [, a, b] = text.match(/(\d[\d,]*) of (\d[\d,]*)/); if (Number(a.replace(/,/g, "")) > Number(b.replace(/,/g, ""))) { out.push({ kind: "pledged-over-target", detail: text }); break; } }
  return out;
};

const browser = await puppeteer.launch({ headless: "new", args: ["--no-sandbox"] });
const problems = [];
for (const size of SIZES) {
  for (const view of VIEWS) {
    const page = await browser.newPage();
    await page.setViewport({ width: size.width, height: size.height });
    const local = [];
    page.on("pageerror", (error) => local.push({ kind: "page-error", detail: error.message.slice(0, 160) }));
    page.on("console", (m) => { if (m.type() === "error" && !/favicon|ResizeObserver|Failed to load resource: the server responded with a status of 4(01|04)/.test(m.text())) local.push({ kind: "console-error", detail: m.text().slice(0, 160) }); });
    page.on("response", (r) => { if (r.url().startsWith(BASE + "/api/") && r.status() >= 500) local.push({ kind: "api-5xx", detail: `${r.status()} ${r.url().replace(BASE, "").slice(0, 80)}` }); });
    await page.evaluateOnNewDocument(() => localStorage.setItem("wholeshare_onboarding_confirmed", "true"));
    await page.goto(`${BASE}/#${view}`, { waitUntil: "networkidle2", timeout: 45000 }).catch(() => local.push({ kind: "load-failed", detail: view }));
    await sleep(2500);
    local.push(...(await page.evaluate(inspect)));
    if (shotsDir) await page.screenshot({ path: `${shotsDir}/${size.name}-${view.replace(/\W+/g, "_")}.png` });
    const seen = new Set();
    for (const item of local) { const key = `${item.kind}|${item.detail}`; if (!seen.has(key)) { seen.add(key); problems.push({ size: size.name, view, ...item }); } }
    await page.close();
  }
}
await browser.close();
if (!problems.length) console.log(`UI layout: ${VIEWS.length} screens at ${SIZES.length} sizes, no problems.`);
else { console.log(`UI layout: ${problems.length} problem(s)`); for (const p of problems) console.log(`  [${p.size}] ${p.view}: ${p.kind}: ${p.detail}`); process.exitCode = 1; }
