// Turns each architecture SVG in docs/architecture into a PNG that renders everywhere, including the GitHub README.
import puppeteer from "puppeteer";
import { readdirSync, readFileSync } from "node:fs";
const DIR = new URL("../docs/architecture/", import.meta.url).pathname;
const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox"] });
for (const file of readdirSync(DIR).filter((name) => name.endsWith(".svg"))) {
  const svg = readFileSync(DIR + file, "utf8");
  const [w, h] = (svg.match(/viewBox="[\d.\-]+ [\d.\-]+ ([\d.]+) ([\d.]+)"/) || []).slice(1).map(Number);
  const width = Math.min(2400, Math.max(1400, Math.round(w)));
  const height = Math.round((h / w) * width);
  const page = await browser.newPage();
  await page.setViewport({ width, height, deviceScaleFactor: 1.5 });
  await page.setContent(`<body style="margin:0;background:#fff"><img style="width:${width}px;height:${height}px;display:block" src="data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}"></body>`);
  await new Promise((r) => setTimeout(r, 600));
  await page.screenshot({ path: DIR + file.replace(".svg", ".png") });
  await page.close();
  console.log(file, width, height);
}
await browser.close();
