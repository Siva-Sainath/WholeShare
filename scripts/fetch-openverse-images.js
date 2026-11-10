// Downloads openly licensed product photos from Openverse (CC0, public domain, CC BY, CC BY-SA).
// Every file is recorded in public/img/products/CREDITS.json with author, license and source page.
// Review the result on a contact sheet before shipping. Search results can still be off topic.
import { writeFileSync, existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const OUT = resolve(process.cwd(), "src/web/public/img/products");
const creditsPath = resolve(OUT, "CREDITS.json");
const credits = existsSync(creditsPath) ? JSON.parse(readFileSync(creditsPath, "utf-8")) : [];
const headers = { "User-Agent": "WholeShareImageFetch/1.0" };

// slug, search phrase, how many to add
const TOPICS = [
  ["lumber", "stacked lumber planks timber", 3], ["castor", "castor oil bottle seeds", 2], ["yarn", "cotton yarn spools cones", 3],
  ["vanilla", "vanilla beans pods", 2], ["tool", "carbide end mill cutting tool", 2], ["wire", "copper wire coil spool", 2],
  ["led", "LED light panel lamp", 2], ["inverter", "solar inverter wall mounted", 2], ["stone", "sandstone slabs paving", 2],
  ["welding", "welding rods electrodes", 2], ["induction", "induction cooktop", 2], ["cashew", "cashew nuts raw", 2],
  ["bearing", "ball bearing steel", 2], ["plastic", "plastic pellets granules", 2], ["flour", "wheat flour sack bakery", 2],
  ["coffee", "green coffee beans burlap sack", 2], ["tiles", "ceramic floor tiles stack", 2], ["rebar", "steel rebar bundles", 2],
  ["silk", "silk fabric roll", 2], ["cotton", "cotton fabric rolls textile", 3], ["tea", "tea leaves processing", 2], ["packaging", "cardboard boxes packaging warehouse", 2],
  ["honey", "honey jar jars", 2], ["bottles", "glass bottles factory", 2], ["fasteners", "stainless steel nuts and bolts", 2]
];

function nextName(slug) {
  for (let n = 1; n < 20; n += 1) {
    const name = n === 1 ? `${slug}.jpg` : `${slug}-${n}.jpg`;
    if (!existsSync(resolve(OUT, name))) return name;
  }
  return null;
}

const only = process.argv.slice(2);
const usedUrls = new Set(credits.map((entry) => entry.sourceUrl));
for (const [slug, phrase, count] of TOPICS) {
  if (only.length > 0 && !only.includes(slug)) continue;
  await new Promise((resolveWait) => setTimeout(resolveWait, 3500));
  const url = `https://api.openverse.org/v1/images/?${new URLSearchParams({ q: phrase, license: "cc0,pdm,by,by-sa", category: "photograph", extension: "jpg", page_size: "20", mature: "false" })}`;
  let data;
  for (let attempt = 0; attempt < 3 && !data; attempt += 1) {
    try {
      data = await (await fetch(url, { headers })).json();
    } catch {
      await new Promise((resolveWait) => setTimeout(resolveWait, 8000));
    }
  }
  if (!data) { console.log("search failed", slug); continue; }
  let added = 0;
  for (const result of data.results ?? []) {
    if (added >= count) break;
    if (usedUrls.has(result.foreign_landing_url)) continue;
    if (!result.width || !result.height || result.width < 700 || result.width / result.height < 1.1 || result.width / result.height > 2.4) continue;
    const name = nextName(slug);
    if (!name) break;
    const image = await fetch(result.url, { headers }).catch(() => null);
    if (!image || !image.ok) continue;
    writeFileSync(resolve(OUT, name), Buffer.from(await image.arrayBuffer()));
    usedUrls.add(result.foreign_landing_url);
    credits.push({ file: name, topic: phrase, title: result.title, sourceUrl: result.foreign_landing_url, author: (result.creator || "Unknown").slice(0, 160), license: `${String(result.license).toUpperCase()} ${result.license_version ?? ""}`.trim(), provider: result.source });
    console.log("ok", name, result.license);
    added += 1;
    await new Promise((resolveWait) => setTimeout(resolveWait, 600));
  }
  writeFileSync(creditsPath, JSON.stringify(credits, null, 2));
}
console.log("credits", credits.length);
