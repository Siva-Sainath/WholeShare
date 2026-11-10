// Downloads openly licensed product photos from Wikimedia Commons into src/web/public/img/products.
// Only CC0, public domain, CC BY and CC BY-SA files are kept. Every file is recorded in CREDITS.json.
import { mkdirSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const OUT = resolve(process.cwd(), "src/web/public/img/products");
mkdirSync(OUT, { recursive: true });

const TOPICS = [
  ["coffee", "green coffee beans sack"],
  ["flour", "wheat flour bag"],
  ["olive-oil", "olive oil bottles"],
  ["pistachio", "pistachio nuts"],
  ["vanilla", "vanilla pods"],
  ["tea", "tea leaves"],
  ["spice", "spices market"],
  ["chocolate", "cocoa beans"],
  ["honey", "honey jar"],
  ["rice", "rice grain"],
  ["tiles", "porcelain floor tiles"],
  ["boxes", "cardboard boxes stacked warehouse"],
  ["pallet", "warehouse pallets"],
  ["film", "stretch film pallet wrapping"],
  ["bolts", "bolts and nuts"],
  ["tool", "end mill milling cutter"],
  ["solar", "solar panels"],
  ["heat", "heat exchanger industrial"],
  ["pump", "centrifugal pump"],
  ["cotton", "cotton textile rolls"],
  ["denim", "blue jeans fabric texture"],
  ["cable", "copper wire coil"],
  ["gloves", "disposable gloves"],
  ["janitorial", "cleaning supplies"],
  ["kitchen", "restaurant kitchen stainless steel"],
  ["aluminum", "aluminium coil"],
  ["lumber", "lumber yard timber stacks"],
  ["geothermal", "heat pump outdoor unit"],
  ["bottles", "glass bottles"],
  ["container", "shipping container port"],
  ["cashew", "cashew nuts kernels"],
  ["almond", "almonds nuts bowl"],
  ["walnut", "walnuts shelled"],
  ["saffron", "saffron threads"],
  ["cardamom", "green cardamom pods"],
  ["pepper", "black pepper peppercorns"],
  ["basmati", "basmati rice grains"],
  ["dates", "medjool dates"],
  ["turmeric", "turmeric powder roots"],
  ["pcb", "printed circuit board electronics"],
  ["battery", "lithium ion battery cells"],
  ["led", "LED lights strip"],
  ["microcontroller", "arduino microcontroller board"],
  ["resistor", "electronic components resistors capacitors"],
  ["wire", "electrical wire spools"],
  ["fasteners", "stainless steel hex nuts washers"],
  ["bearing", "ball bearings steel"],
  ["welding", "welding electrodes"],
  ["silk", "silk fabric rolls"],
  ["jute", "jute hessian fabric"],
  ["yarn", "cotton yarn cones"],
  ["stone", "natural stone slabs"],
  ["rebar", "steel rebar bundles"],
  ["cement", "cement bags construction"],
  ["glassware", "glass jars bottles"],
  ["plastic", "plastic pellets granules"],
  ["castor", "vegetable oil drums"],
  ["neem", "essential oil bottles"],
  ["street-light", "solar street light"],
  ["inverter", "solar inverter"],
  ["mask", "surgical face masks"],
  ["induction", "commercial kitchen equipment"]
];
const VARIANTS = 3;

const ALLOWED = /^(CC0|Public domain|PD|CC BY(-SA)? \d)/i;
const headers = { "User-Agent": "WholeShareDemo/1.0 (hackathon demo; contact via repository owner)" };
const creditsPath = resolve(OUT, "CREDITS.json");
const credits = existsSync(creditsPath) ? JSON.parse(readFileSync(creditsPath, "utf-8")) : [];

const strip = (html) => String(html || "").replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();

for (const [slug, term] of TOPICS) {
  const wanted = [`${slug}.jpg`, `${slug}-2.jpg`, `${slug}-3.jpg`].slice(0, VARIANTS).filter((file) => !existsSync(resolve(OUT, file)));
  if (wanted.length === 0) continue;
  const url = new URL("https://commons.wikimedia.org/w/api.php");
  url.search = new URLSearchParams({
    action: "query", format: "json", generator: "search", gsrsearch: `${term} filetype:bitmap`, gsrnamespace: "6", gsrlimit: "30",
    prop: "imageinfo", iiprop: "url|extmetadata|mime|size", iiurlwidth: "900"
  }).toString();
  let data = null;
  for (let attempt = 0; attempt < 4 && !data; attempt += 1) {
    const res = await fetch(url, { headers });
    const text = await res.text();
    try { data = JSON.parse(text); } catch { await new Promise((r) => setTimeout(r, 8000)); }
  }
  if (!data) { console.log("rate limited", slug); continue; }
  const pages = Object.values(data.query?.pages || {}).sort((a, b) => (a.index || 0) - (b.index || 0));
  const used = new Set(credits.map((entry) => entry.title));
  for (const file of wanted) {
    let picked = null;
    for (const page of pages) {
      if (used.has(page.title)) continue;
      const info = page.imageinfo?.[0];
      if (!info || info.mime !== "image/jpeg" || !info.thumburl) continue;
      if (info.width < 900 || info.width / info.height < 1.0 || info.width / info.height > 2.4) continue;
      const meta = info.extmetadata || {};
      const license = strip(meta.LicenseShortName?.value);
      if (!ALLOWED.test(license)) continue;
      picked = { page, info, license, author: strip(meta.Artist?.value) || "Unknown" };
      break;
    }
    if (!picked) { console.log("no match", file); continue; }
    used.add(picked.page.title);
    const img = await fetch(picked.info.thumburl, { headers });
    if (!img.ok) { console.log("download failed", file, img.status); continue; }
    writeFileSync(resolve(OUT, file), Buffer.from(await img.arrayBuffer()));
    credits.push({ file, topic: term, title: picked.page.title, sourceUrl: picked.info.descriptionurl, author: picked.author.slice(0, 160), license: picked.license });
    console.log("ok", file, picked.license);
    writeFileSync(creditsPath, JSON.stringify(credits, null, 2));
    await new Promise((r) => setTimeout(r, 2500));
  }
}
writeFileSync(creditsPath, JSON.stringify(credits, null, 2));
console.log("credits", credits.length);
