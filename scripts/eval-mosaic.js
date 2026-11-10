// Generalization eval for Mosaic: 100 prompts, 10 jobs, 10 phrasings each. 30 are held out and must never be tuned against.
// A prompt passes when the model attempts a tool that serves the job and none that must not run.
// Write permissions are switched off while it runs, so a correct attempt at a write counts but changes nothing. Settings are restored after.
// Usage: node scripts/eval-mosaic.js [--job=name] [--heldout] [--tuned] [--conc=4] [--out=docs/assets/mosaic-eval-general.json]
import fs from "node:fs";

const BASE = process.env.BASE_URL || "http://localhost:3000";
const arg = (name) => (process.argv.find((a) => a.startsWith(`--${name}=`)) || "").split("=")[1];
const items = JSON.parse(fs.readFileSync(new URL("../test/fixtures/mosaic-eval.json", import.meta.url), "utf8"))
  .filter((item) => (!arg("job") || item.job === arg("job")) && (!process.argv.includes("--heldout") || item.heldOut) && (!process.argv.includes("--tuned") || !item.heldOut));
const concurrency = Number(arg("conc")) || 4;
const outPath = arg("out") || new URL("../docs/assets/mosaic-eval-general.json", import.meta.url).pathname;

const call = async (path, body, method = "POST") => {
  const response = await fetch(`${BASE}${path}`, { method, headers: { "content-type": "application/json", origin: BASE }, body: body ? JSON.stringify(body) : undefined });
  return response.json();
};

const before = await call("/api/v1/user/settings", null, "GET");
const usageBefore = await call("/api/v1/harness/usage", null, "GET");
const spendBefore = (await call("/api/v1/harness/usage", null, "GET")).spend?.estimatedUsd ?? 0;
await call("/api/v1/user/settings", { agentPermissions: { allowAutonomousFilterSort: true, allowAutonomousQuotePrep: true, allowAutonomousResearch: true, allowAutonomousDraftMessages: false, allowAutonomousScheduleChanges: false } });

const results = [];
let cursor = 0;
async function worker() {
  while (cursor < items.length) {
    const item = items[cursor++];
    const started = Date.now();
    let tools = [];
    let reply = "";
    let error = "";
    try {
      const payload = await Promise.race([
        call("/api/v1/agent/chat", { prompt: item.prompt, maxTurns: 6, metadata: { source: "mosaic-deep-work", context: {} } }),
        new Promise((_, reject) => setTimeout(() => reject(new Error("timeout 90s")), 90000))
      ]);
      tools = (payload.steps || []).map((step) => step.toolName).filter(Boolean);
      reply = String(payload.finalMessage || "");
      if (payload.error) error = String(payload.error);
    } catch (cause) {
      error = cause.message;
    }
    const hit = item.any.some((tool) => tools.includes(tool));
    const bad = item.forbid.filter((tool) => tools.includes(tool));
    results.push({ ...item, tools, reply: reply.slice(0, 400), error, ms: Date.now() - started, pass: hit && bad.length === 0 && !error });
    process.stdout.write(results[results.length - 1].pass ? "." : "x");
  }
}
await Promise.all(Array.from({ length: concurrency }, worker));
await call("/api/v1/user/settings", { agentPermissions: before.agentPermissions || {} });

const usageAfter = await call("/api/v1/harness/usage", null, "GET");
const spendAfter = usageAfter.spend;
const modelCalls = usageAfter.calls - usageBefore.calls;
const modelMs = usageAfter.modelMs - usageBefore.modelMs;
const rate = (rows) => (rows.length ? Math.round((rows.filter((r) => r.pass).length / rows.length) * 100) : null);
const jobs = [...new Set(results.map((r) => r.job))];
const sorted = [...results].sort((a, b) => a.ms - b.ms);
const summary = {
  at: new Date().toISOString(),
  modelCallsPerPrompt: Math.round((modelCalls / Math.max(results.length, 1)) * 10) / 10,
  avgModelCallMs: modelCalls ? Math.round(modelMs / modelCalls) : null,
  runCostUsd: Math.round(((spendAfter?.estimatedUsd ?? 0) - spendBefore) * 10000) / 10000,
  budgetRemainingUsd: spendAfter?.remainingUsd ?? null,
  total: results.length,
  overallPct: rate(results),
  tunedPct: rate(results.filter((r) => !r.heldOut)),
  heldOutPct: rate(results.filter((r) => r.heldOut)),
  medianMs: sorted[Math.floor(sorted.length / 2)]?.ms ?? null,
  p90Ms: sorted[Math.floor(sorted.length * 0.9)]?.ms ?? null,
  byJob: Object.fromEntries(jobs.map((job) => [job, rate(results.filter((r) => r.job === job))])),
  failures: results.filter((r) => !r.pass).map((r) => ({ job: r.job, heldOut: r.heldOut, prompt: r.prompt, tools: r.tools, error: r.error, reply: r.reply.slice(0, 160) }))
};
fs.mkdirSync(new URL("../docs/assets/", import.meta.url).pathname, { recursive: true });
fs.writeFileSync(outPath, JSON.stringify({ summary, results }, null, 1));
console.log(`\nRun cost about $${summary.runCostUsd}, budget remaining $${summary.budgetRemainingUsd}`);
console.log(`Model calls per prompt ${summary.modelCallsPerPrompt}, average model call ${summary.avgModelCallMs} ms`);
console.log(`Overall ${summary.overallPct}% (tuned ${summary.tunedPct}%, held out ${summary.heldOutPct}%), median ${summary.medianMs} ms, p90 ${summary.p90Ms} ms`);
console.log("By job:", JSON.stringify(summary.byJob));
if (process.argv.includes("--fails")) for (const f of summary.failures) console.log(`FAIL [${f.job}] ${f.prompt} -> [${f.tools.join(", ")}] ${f.error}`);
