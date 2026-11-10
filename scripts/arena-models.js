// Model arena. Runs the same golden prompts against each candidate model through the real harness,
// then scores pass rate, speed and cost from measured tokens. Needs FIREWORKS_API_KEY in the environment.
// Usage: FIREWORKS_API_KEY=... node scripts/arena-models.js glm-5p3-flash deepseek-v4p1-flash
import { spawn, spawnSync } from "node:child_process";
import { writeFileSync, existsSync, readFileSync } from "node:fs";

// USD per 1M tokens (input, cached input, output) from fireworks.ai/pricing, serverless standard.
const PRICE = {
  "glm-5p3-flash": [0.15, 0.03, 0.5], "deepseek-v4p1-flash": [0.3, 0.006, 1.2], "qwen3p8-max": [2.0, 0.25, 6.0],
  "gpt-oss-120b": [0.15, 0.015, 0.6], "nemotron-lightning-3p5-30b-a3b": [0.05, 0.01, 0.2], "minimax-m3p1-flash": [0.3, 0.06, 1.2],
  "minimax-m3": [0.3, 0.06, 1.2], "glm-5p3": [1.4, 0.26, 4.4], "kimi-k3": [3.0, 0.3, 15.0]
};
const names = process.argv.slice(2);
if (!process.env.FIREWORKS_API_KEY || names.length === 0) { console.error("Set FIREWORKS_API_KEY and pass model names."); process.exit(2); }
const out = [];

for (const [index, name] of names.entries()) {
  const port = 3100 + index;
  const base = `http://127.0.0.1:${port}`;
  const server = spawn("node", ["--env-file-if-exists=.env", "src/web/server.js"], {
    env: { ...process.env, PORT: String(port), MOSAIC_PROVIDER: "fireworks", MOSAIC_MODEL_NAME: `accounts/fireworks/models/${name}`, MOSAIC_ENABLE_THINKING: "false" }, stdio: "ignore"
  });
  let healthy = false;
  for (let i = 0; i < 40 && !healthy; i += 1) {
    await new Promise((r) => setTimeout(r, 1000));
    healthy = await fetch(`${base}/api/v1/health`).then((r) => r.ok).catch(() => false);
  }
  if (!healthy) { console.log(name, "server did not start"); server.kill(); continue; }
  await new Promise((r) => setTimeout(r, 6000));
  const run = spawnSync("node", ["scripts/verify-mosaic.js"], { env: { ...process.env, BASE_URL: base }, encoding: "utf8", timeout: 900000 });
  const text = run.stdout || "";
  const summary = text.match(/(\d+) of (\d+) passed, median ([\d.]+)s/);
  const usage = await fetch(`${base}/api/v1/harness/usage`).then((r) => r.json()).catch(() => null);
  const failed = [...text.matchAll(/^FAIL\s+(\d+)\s+[\d.]+s\s+(.*?)\s+\[/gm)].map((m) => `${m[1]}`);
  const [pin, pcached, pout] = PRICE[name] ?? [0, 0, 0];
  const uncached = usage ? usage.promptTokens - usage.cachedTokens : 0;
  const costPerTurn = usage && usage.calls ? ((uncached * pin + usage.cachedTokens * pcached + usage.completionTokens * pout) / 1e6) / usage.calls : null;
  out.push({ name, passed: summary ? Number(summary[1]) : 0, total: summary ? Number(summary[2]) : 0, median: summary ? Number(summary[3]) : null, failed, calls: usage?.calls ?? 0, promptPerCall: usage?.calls ? Math.round(usage.promptTokens / usage.calls) : 0, outPerCall: usage?.calls ? Math.round(usage.completionTokens / usage.calls) : 0, costPerCall: costPerTurn });
  console.log(JSON.stringify(out[out.length - 1]));
  server.kill();
  await new Promise((r) => setTimeout(r, 1500));
}

const row = (r) => `| ${r.name} | ${r.passed}/${r.total} | ${r.median ?? "n/a"} s | ${r.promptPerCall} / ${r.outPerCall} | ${r.costPerCall === null ? "n/a" : `$${r.costPerCall.toFixed(5)}`} | ${r.failed.join(", ") || "none"} |`;
writeFileSync("docs/assets/model-arena.md", `# Model arena\n\nRun ${new Date().toISOString()}. Same ${out[0]?.total ?? ""} golden prompts through the live harness, serverless standard rates.\n\n| Model | Passed | Median per prompt | Tokens per call in / out | Cost per model call | Failed cases |\n|---|---|---|---|---|---|\n${out.map(row).join("\n")}\n`);
console.log("wrote docs/assets/model-arena.md");
