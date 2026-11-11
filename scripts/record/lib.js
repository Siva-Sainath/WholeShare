// Recording helpers: a visible cursor with click ripples, smooth mouse moves and scrolling, and segment capture to mp4.
import puppeteer from "puppeteer";
import { mkdirSync } from "node:fs";

export const OUT = `${process.env.HOME}/Movies/WholeShare-demo/raw`;
mkdirSync(OUT, { recursive: true });
export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const CURSOR = `(() => {
  const mount = () => {
    if (document.getElementById("__cur")) return;
    const style = document.createElement("style");
    style.textContent = "#__cur{position:fixed;left:0;top:0;width:28px;height:28px;z-index:2147483647;pointer-events:none;transform:translate(-100px,-100px);filter:drop-shadow(0 2px 3px rgba(0,0,0,.35))}#__rip{position:fixed;z-index:2147483646;pointer-events:none;width:14px;height:14px;margin:-7px 0 0 -7px;border-radius:50%;border:3px solid #0070BA;opacity:0;transform:scale(.4)}#__rip.go{animation:__rip .55s ease-out}@keyframes __rip{0%{opacity:.9;transform:scale(.4)}100%{opacity:0;transform:scale(3.2)}}";
    document.documentElement.appendChild(style);
    const cur = document.createElement("div");
    cur.id = "__cur";
    cur.innerHTML = '<svg width="28" height="28" viewBox="0 0 24 24"><path d="M3 2l7.2 18.2 2.6-7.4 7.4-2.6z" fill="#111" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/></svg>';
    const rip = document.createElement("div");
    rip.id = "__rip";
    document.documentElement.append(cur, rip);
    window.addEventListener("mousemove", (e) => { cur.style.transform = "translate(" + e.clientX + "px," + e.clientY + "px)"; rip.style.left = e.clientX + "px"; rip.style.top = e.clientY + "px"; }, true);
    window.addEventListener("mousedown", () => { rip.classList.remove("go"); void rip.offsetWidth; rip.classList.add("go"); }, true);
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount); else mount();
  new MutationObserver(mount).observe(document, { childList: true });
})();`;

export async function launch() {
  const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox", "--window-size=1920,1080", "--force-device-scale-factor=1", "--disable-features=Translate"], defaultViewport: { width: 1920, height: 1080, deviceScaleFactor: 1 } });
  const page = await browser.newPage();
  await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 1 });
  await page.evaluateOnNewDocument(CURSOR);
  return { browser, page, pos: { x: 960, y: 540 } };
}

export async function start(page, name) {
  const recorder = await page.screencast({ path: `${OUT}/${name}.mp4`, fps: 30 });
  return { stop: () => recorder.stop() };
}

export async function glide(ctx, x, y, steps = 28) {
  const { page, pos } = ctx;
  for (let i = 1; i <= steps; i += 1) {
    const t = i / steps;
    const e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
    await page.mouse.move(pos.x + (x - pos.x) * e, pos.y + (y - pos.y) * e);
    await sleep(14);
  }
  ctx.pos = { x, y };
}

export async function center(ctx, handle) {
  await handle.evaluate((el) => el.scrollIntoView({ block: "center", behavior: "smooth" }));
  await sleep(500);
  const box = await handle.boundingBox();
  if (!box) throw new Error("element is not visible");
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

export async function clickHandle(ctx, handle, pause = 350) {
  const { x, y } = await center(ctx, handle);
  await glide(ctx, x, y);
  await sleep(pause);
  await ctx.page.mouse.down();
  await sleep(70);
  await ctx.page.mouse.up();
}

// Finds a visible button, link or tab by its text.
export async function byText(page, text, tags = "button,a,[role=tab],[role=button],label") {
  const handle = await page.evaluateHandle((text, tags) => {
    const norm = (value) => value.replace(/\s+/g, " ").trim().toLowerCase();
    const want = norm(text);
    const visible = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== "hidden"; };
    return [...document.querySelectorAll(tags)].filter(visible).find((el) => norm(el.textContent || "").startsWith(want)) || null;
  }, text, tags);
  const el = handle.asElement();
  if (!el) throw new Error(`No visible control starting with "${text}"`);
  return el;
}

export async function clickText(ctx, text, pause) {
  await clickHandle(ctx, await byText(ctx.page, text), pause);
}

export async function typeHuman(ctx, text, delay = 55) {
  for (const ch of text) { await ctx.page.keyboard.type(ch); await sleep(delay + Math.random() * 40); }
}

export async function scrollBy(ctx, pixels, ms = 1800) {
  const steps = Math.max(8, Math.round(ms / 40));
  for (let i = 0; i < steps; i += 1) { await ctx.page.mouse.wheel({ deltaY: pixels / steps }); await sleep(ms / steps); }
}

export async function clickSel(ctx, selector, pause) {
  const handle = await ctx.page.waitForSelector(selector, { visible: true, timeout: 30000 });
  await clickHandle(ctx, handle, pause);
}
