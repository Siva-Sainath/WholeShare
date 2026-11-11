// Wraps the Cap CLI: find a window, record it in the background, stop it, apply the treatment, export.
import { execFileSync } from "node:child_process";
import { writeFileSync, rmSync } from "node:fs";
import { sleep } from "./lib.js";

export const CAP_DIR = `${process.env.HOME}/Movies/WholeShare-demo/cap`;
const cap = (args) => {
  const out = execFileSync("cap", [...args, "--json"], { encoding: "utf8", maxBuffer: 1 << 26 }).trim();
  try { return JSON.parse(out); } catch { /* several lines of events: keep the last complete object */ }
  const objects = out.split("\n").map((line) => { try { return JSON.parse(line); } catch { return null; } }).filter(Boolean);
  if (objects.length === 0) throw new Error(`Cap returned no JSON for: cap ${args.join(" ")}`);
  return objects[objects.length - 1];
};

export function chromeWindows() {
  const targets = cap(["targets"]);
  return targets.windows.filter((w) => /Chrome for Testing/.test(w.ownerName));
}

// Starts recording one window. Returns once Cap has begun capturing.
export async function startCap(name, windowId) {
  const path = `${CAP_DIR}/${name}.cap`;
  rmSync(path, { recursive: true, force: true });
  const started = cap(["record", "start", "--window", String(windowId), "--detach", "--path", path]);
  await sleep(1200);
  return { id: started.recordingId, path, t0: Date.now() };
}

export function stopCap(rec) {
  const stopped = cap(["record", "stop", "--id", rec.id]);
  if (!stopped.recordingMetaExists) throw new Error(`Recording ${rec.path} did not finish`);
  rec.t1 = Date.now();
  return stopped;
}

// Records one clip while fn runs, and saves the timing log next to the project.
export async function clip(ctx, name, fn, windowId) {
  ctx.front?.();
  await sleep(600);
  const win = windowId ?? chromeWindows().sort((a, b) => b.bounds.width * b.bounds.height - a.bounds.width * a.bounds.height)[0].id;
  ctx.log = [];
  const rec = await startCap(name, win);
  try { await fn(); } finally { stopCap(rec); }
  const vp = await ctx.page.evaluate(() => ({ w: innerWidth, h: innerHeight })).catch(() => ({ w: 1440, h: 810 }));
  writeFileSync(`${CAP_DIR}/${name}.events.json`, JSON.stringify({ t0: rec.t0, t1: rec.t1, vp, log: ctx.log }, null, 1));
  ctx.log = null;
  console.log("clip", name, ((rec.t1 - rec.t0) / 1000).toFixed(1), "s");
}
