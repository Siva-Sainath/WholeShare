// Edits a Cap recording with ffmpeg: crops the title bar, scales to 1080p, speeds up the waiting parts, eases a zoom onto
// each click and typing moment, and puts a "Nx sped up" badge in the top right corner of every sped-up stretch.
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import puppeteer from "puppeteer";

const CAP = `${process.env.HOME}/Movies/WholeShare-demo/cap`;
const BADGES = `${process.env.HOME}/Movies/WholeShare-demo/raw`;
const probe = (file, entry) => Number(execFileSync("ffprobe", ["-v", "error", "-show_entries", `${entry}`, "-of", "default=nw=1:nk=1", file], { encoding: "utf8" }).trim().split("\n")[0]);

export async function edit(name, { zoom = 1.45, noZoom = false, target = null, keep = null } = {}) {
  const raw = `${CAP}/${name}.cap/content/segments/segment-0/display.mp4`;
  const ev = JSON.parse(readFileSync(`${CAP}/${name}.events.json`, "utf8"));
  const rw = probe(raw, "stream=width"), rh = probe(raw, "stream=height");
  const D = probe(raw, "format=duration");
  const offset = D - (ev.t1 - ev.t0) / 1000; // the video can start late, so line the log up from the end
  const src = (ms) => Math.min(D, Math.max(0, (ms - ev.t0) / 1000 + offset));
  const pxPerCss = rw / ev.vp.w; // device pixels per page pixel
  const fullContentH = Math.min(rh, Math.round(ev.vp.h * pxPerCss)); // the page area, without the browser's tab strip and address bar
  const titlePx = rh - fullContentH;
  const bottomTrim = Math.round(fullContentH * 0.04); // drops the desktop's Now Playing pill that sits over the bottom edge
  const contentH = fullContentH - bottomTrim;
  const cw = rw, cropH = contentH;
  const outH = Math.min(1080, Math.round(1920 * contentH / rw)); // page area scaled to 1920 wide
  const padTop = Math.floor((1080 - outH) / 2);

  const ranges = [];
  let open = null;
  for (const e of ev.log) {
    if (e.k === "fast-start") open = e;
    if (e.k === "fast-end" && open) { const a = src(open.t), b = src(e.t); if (b - a > 1.2) ranges.push({ a, b, speed: open.speed }); open = null; }
  }
  const pieces = [];
  let cur = 0;
  for (const r of ranges) { if (r.a > cur) pieces.push({ a: cur, b: r.a, speed: 1 }); pieces.push({ a: r.a, b: r.b, speed: r.speed }); cur = r.b; }
  if (cur < D - 0.05) pieces.push({ a: cur, b: D, speed: 1 });
  // To fit a time budget, everything is sped up evenly on top of the waiting stretches. The badge always shows the real speed.
  const naturalTotal = pieces.reduce((sum, p) => sum + (p.b - p.a) / p.speed, 0);
  const base = target && naturalTotal > target ? naturalTotal / target : 1;
  for (const p of pieces) p.speed = p.speed * base;
  const outT = (t) => { let out = 0; for (const p of pieces) { if (t >= p.b) out += (p.b - p.a) / p.speed; else { out += Math.max(0, t - p.a) / p.speed; break; } } return out; };
  const inFast = (t) => ranges.some((r) => t >= r.a - 0.2 && t <= r.b + 0.2);
  const total = pieces.reduce((s, p) => s + (p.b - p.a) / p.speed, 0);

  const zs = [];
  if (!noZoom) {
    for (const e of ev.log.filter((l) => l.k === "click" || l.k === "type")) {
      const t = src(e.t);
      if (inFast(t)) continue;
      const o = outT(t);
      let a = Math.max(0, o - 0.8), b = o + (e.k === "type" ? 3.0 : 1.6);
      const prev = zs[zs.length - 1];
      if (prev && a < prev.b + 0.9) { if (o - prev.b < -0.2) continue; a = prev.b + 0.9; if (b - a < 1.0) continue; }
      zs.push({ a, b: Math.min(b, total - 0.2), amount: e.k === "type" ? zoom + 0.1 : zoom, cx: Math.min(0.88, Math.max(0.12, e.x / ev.vp.w)), cy: Math.min(0.88, Math.max(0.12, (padTop + (e.y / ev.vp.h) * outH) / 1080)) });
    }
  }
  const ease = 0.55;
  const sm = (x) => `(clip(${x},0,1)*clip(${x},0,1)*(3-2*clip(${x},0,1)))`;
  const bump = (z) => `(${sm(`(t-${z.a.toFixed(3)})/${ease}`)}*(1-${sm(`(t-${z.b.toFixed(3)})/${ease}`)}))`;
  const zExpr = zs.length ? `1+${zs.map((z) => `${(z.amount - 1).toFixed(3)}*${bump(z)}`).join("+")}` : "1";
  const pick = (key) => zs.reduceRight((acc, z) => `if(between(t,${(z.a - 0.1).toFixed(3)},${(z.b + ease).toFixed(3)}),${z[key].toFixed(4)},${acc})`, "0.5");

  const lines = [];
  lines.push(`[0:v]crop=${cw}:${cropH}:0:${titlePx},scale=1920:${outH}:flags=lanczos,pad=1920:1080:0:${padTop}:color=0xF7F5F0,fps=30,setsar=1,split=${pieces.length}${pieces.map((_, i) => `[s${i}]`).join("")}`);
  pieces.forEach((p, i) => lines.push(`[s${i}]trim=${p.a.toFixed(3)}:${p.b.toFixed(3)},setpts=(PTS-STARTPTS)/${p.speed}[p${i}]`));
  lines.push(`${pieces.map((_, i) => `[p${i}]`).join("")}concat=n=${pieces.length}:v=1:a=0[base]`);
  if (zs.length) {
    lines.push(`[base]scale=w='1920*(${zExpr})':h='1080*(${zExpr})':eval=frame:flags=bilinear[zz]`);
    lines.push(`[zz]crop=1920:1080:x='clip((${pick("cx")})*iw-960,0,iw-1920)':y='clip((${pick("cy")})*ih-540,0,ih-1080)'[zoomed]`);
  } else lines.push(`[base]null[zoomed]`);
  let last = "zoomed";
  const labels = [];
  let acc = 0;
  for (const p of pieces) {
    const len = (p.b - p.a) / p.speed;
    const label = p.speed >= 1.15 ? `${Math.round(p.speed * 10) / 10}`.replace(/\.0$/, "") : null;
    const prev = labels[labels.length - 1];
    if (label && prev && prev.label === label && Math.abs(prev.b - acc) < 0.05) prev.b = acc + len; else if (label) labels.push({ label, a: acc, b: acc + len });
    acc += len;
  }
  const browser = labels.length ? await puppeteer.launch({ headless: true, args: ["--no-sandbox"] }) : null;
  const made = new Set();
  for (const l of labels) {
    if (made.has(l.label)) continue;
    made.add(l.label);
    const page = await browser.newPage();
    await page.setViewport({ width: 340, height: 100 });
    await page.setContent(`<body style="margin:0;background:transparent"><div style="display:inline-flex;align-items:center;gap:10px;padding:12px 22px;border-radius:999px;background:rgba(15,31,46,.9);color:#fff;font:600 32px/1 -apple-system,Helvetica,Arial,sans-serif;margin:8px;border:2px solid rgba(255,255,255,.25)"><span style="color:#FFC439">${l.label}x</span><span style="font-weight:500;font-size:23px">sped up</span></div></body>`);
    await page.screenshot({ path: `${BADGES}/badge-${l.label}x.png`, omitBackground: true, clip: { x: 0, y: 0, width: 340, height: 100 } });
    await page.close();
  }
  if (browser) await browser.close();
  labels.forEach((l, i) => { lines.push(`[${last}][${i + 1}:v]overlay=W-w-30:30:enable='between(t,${l.a.toFixed(2)},${l.b.toFixed(2)})'[o${i}]`); last = `o${i}`; });
  const script = `${CAP}/${name}.filter.txt`;
  writeFileSync(script, lines.join(";\n"));
  const out = `${CAP}/${name}.final.mp4`;
  const inputs = ["-i", raw, ...labels.flatMap((l) => ["-i", `${BADGES}/badge-${l.label}x.png`])];
  execFileSync("ffmpeg", ["-y", "-v", "error", ...inputs, "-filter_complex_script", script, "-map", `[${last}]`, "-c:v", "libx264", "-crf", "17", "-preset", "medium", "-pix_fmt", "yuv420p", "-r", "30", "-an", out], { stdio: "inherit" });
  const info = { name, out, seconds: Math.round(probe(out, "format=duration") * 10) / 10, rawSeconds: Math.round(D * 10) / 10, zooms: zs.length, sped: labels.map((l) => `${l.label}x ${l.a.toFixed(0)}-${l.b.toFixed(0)}s`), base: Math.round(base * 100) / 100 };
  writeFileSync(`${CAP}/${name}.edit.json`, JSON.stringify(info, null, 1));
  return info;
}

if (process.argv[1].endsWith("edit.js")) for (const arg of process.argv.slice(2)) { const [n, t] = arg.split(":"); console.log(JSON.stringify(await edit(n, { target: t ? Number(t) : null }))); }
