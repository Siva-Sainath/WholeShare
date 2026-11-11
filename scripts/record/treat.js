// Applies Cap's treatment to a recorded clip (zoom on clicks and typing, speed-ups for waiting, brand background),
// exports it with Cap, then adds a "Nx sped up" badge in the top right corner of every sped-up stretch.
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { CAP_DIR } from "./cap-lib.js";

const run = (cmd, args) => execFileSync(cmd, args, { encoding: "utf8", maxBuffer: 1 << 28 });
const capJson = (args) => { const out = run("cap", [...args, "--json"]).trim(); try { return JSON.parse(out); } catch { const o = out.split("\n").map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean); return o[o.length - 1]; } };

export function treat(name, { zoom = 1.5, frameH = 842, bg = { from: [236, 242, 250], to: [214, 226, 243] }, noZoom = false } = {}) {
  const proj = `${CAP_DIR}/${name}.cap`;
  const ev = JSON.parse(readFileSync(`${CAP_DIR}/${name}.events.json`, "utf8"));
  const D = capJson(["project", "validate", proj]).durationSeconds;
  const offset = D - (ev.t1 - ev.t0) / 1000; // the video can start late, so line the log up from the end
  const src = (ms) => Math.min(D, Math.max(0, (ms - ev.t0) / 1000 + offset));

  const fastRanges = [];
  let open = null;
  for (const e of ev.log) {
    if (e.k === "fast-start") open = e;
    if (e.k === "fast-end" && open) { const s = src(open.t), f = src(e.t); if (f - s > 1.2) fastRanges.push({ s, e: f, speed: open.speed }); open = null; }
  }
  const segments = [];
  let cursor = 0;
  for (const r of fastRanges) {
    if (r.s > cursor) segments.push({ recordingSegment: 0, timescale: 1.0, start: cursor, end: r.s, name: null });
    segments.push({ recordingSegment: 0, timescale: r.speed, start: r.s, end: r.e, name: null });
    cursor = r.e;
  }
  if (cursor < D) segments.push({ recordingSegment: 0, timescale: 1.0, start: cursor, end: D, name: null });
  const outT = (t) => { let out = 0; for (const s of segments) { if (t >= s.end) out += (s.end - s.start) / s.timescale; else { out += Math.max(0, t - s.start) / s.timescale; break; } } return out; };
  const inFast = (t) => fastRanges.some((r) => t >= r.s - 0.2 && t <= r.e + 0.2);

  const titleH = frameH - ev.vp.h;
  const zooms = [];
  if (!noZoom) {
    for (const e of ev.log.filter((l) => l.k === "click" || l.k === "type")) {
      const t = src(e.t);
      if (inFast(t)) continue;
      const out = outT(t);
      let start = Math.max(0, out - 0.7), end = out + (e.k === "type" ? 3.2 : 1.7);
      const prev = zooms[zooms.length - 1];
      if (prev && start < prev.end + 0.1) { start = prev.end + 0.1; if (end - start < 1.0) continue; }
      zooms.push({ start, end, amount: e.k === "type" ? zoom + 0.1 : zoom, mode: { manual: { x: Math.min(0.9, Math.max(0.1, e.x / ev.vp.w)), y: Math.min(0.9, Math.max(0.1, (titleH + e.y) / frameH)) } } });
    }
  }

  const cfg = capJson(["project", "config", "get", proj]);
  const config = cfg.config ?? cfg;
  config.background.source = { type: "gradient", from: bg.from, to: bg.to, angle: 135 };
  Object.assign(config.background, { padding: 5.0, rounding: 8.0, shadow: 60.0 });
  config.cursor.hide = true;
  config.timeline.segments = segments;
  config.timeline.zoomSegments = zooms;
  const set = capJson(["project", "config", "set", proj, "--settings-json", JSON.stringify(config)]);
  if (!set.ok) throw new Error(`could not set the project config for ${name}`);

  const raw = `${CAP_DIR}/${name}.mp4`;
  run("cap", ["export", proj, "-o", raw, "--fps", "30", "--quality", "maximum", "--resolution", "1920x1080", "--json"]);

  // Badge overlay for each sped-up stretch.
  const badges = fastRanges.map((r) => ({ a: outT(r.s), b: outT(r.e), speed: r.speed }));
  const final = `${CAP_DIR}/${name}.final.mp4`;
  if (badges.length === 0) { run("cp", [raw, final]); return { final, badges }; }
  const inputs = ["-i", raw];
  for (const b of badges) inputs.push("-i", `${process.env.HOME}/Movies/WholeShare-demo/raw/badge-${b.speed}x.png`);
  let chain = "[0:v]";
  const parts = badges.map((b, i) => `${chain}[${i + 1}:v]overlay=W-w-34:34:enable='between(t,${b.a.toFixed(2)},${b.b.toFixed(2)})'[v${i}]`.replace(chain, i === 0 ? "[0:v]" : `[v${i - 1}]`));
  run("ffmpeg", ["-y", "-v", "error", ...inputs, "-filter_complex", parts.join(";"), "-map", `[v${badges.length - 1}]`, "-map", "0:a?", "-c:v", "libx264", "-crf", "17", "-preset", "medium", "-pix_fmt", "yuv420p", "-c:a", "aac", final]);
  writeFileSync(`${CAP_DIR}/${name}.treat.json`, JSON.stringify({ D, offset, fastRanges, zooms, badges }, null, 1));
  return { final, badges, zooms: zooms.length };
}

if (process.argv[1].endsWith("treat.js")) {
  for (const name of process.argv.slice(2)) console.log(name, JSON.stringify(treat(name)));
}
