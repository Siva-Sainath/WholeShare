// Renders the "sped up" badge shown in the top right corner of every sped-up part of the demo video.
import puppeteer from "puppeteer";
import { OUT } from "./lib.js";
const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox"] });
const page = await browser.newPage();
await page.setViewport({ width: 300, height: 90, deviceScaleFactor: 1 });
for (const speed of [2, 3, 4, 6, 8, 10]) {
  await page.setContent(`<body style="margin:0;background:transparent"><div style="display:inline-flex;align-items:center;gap:10px;padding:12px 20px;border-radius:999px;background:rgba(15,31,46,.88);color:#fff;font:600 30px/1 -apple-system,Helvetica,Arial,sans-serif;margin:10px;border:2px solid rgba(255,255,255,.25)"><span style="color:#FFC439">${speed}x</span><span style="font-weight:500;font-size:22px">sped up</span></div></body>`);
  await page.screenshot({ path: `${OUT}/badge-${speed}x.png`, omitBackground: true, clip: { x: 0, y: 0, width: 300, height: 90 } });
}
await browser.close();
console.log("badges ready");
