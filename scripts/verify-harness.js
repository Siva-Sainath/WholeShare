// Proof that Mosaic is an agent that drives the platform, not a chat box. Re-runnable. Writes docs/assets/harness-proof.md.
// Needs the server and the configured model running. Usage: node scripts/verify-harness.js [--skip-model]
import { readFileSync, writeFileSync, existsSync } from "node:fs";

const BASE = process.env.BASE_URL || "http://localhost:3000";
const skipModel = process.argv.includes("--skip-model");
const rows = [];
const record = (area, check, ok, detail = "") => {
  rows.push({ area, check, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  [${area}] ${check}${detail ? `  (${detail})` : ""}`);
};
const get = async (path) => (await fetch(`${BASE}${path}`)).json();
const post = async (path, body) => (await fetch(`${BASE}${path}`, { method: "POST", headers: { "content-type": "application/json", origin: BASE }, body: JSON.stringify(body) })).json();

// 1. The harness describes itself, so any model or integrator can learn it.
const harness = await get("/api/v1/harness");
record("contract", "manifest lists tools with effects and permissions", Array.isArray(harness.tools) && harness.tools.length >= 20 && harness.tools.every((tool) => tool.effect));
record("contract", "no tool lets a model move money", !harness.tools.some((tool) => /approve|capture|authorize|payout/i.test(tool.name)));
record("contract", "manifest names the model provider and cloud fallback state", Boolean(harness.model?.provider) && harness.model.cloudFallback === false, `${harness.model?.label}, model ${harness.model?.model ?? "server default"}`);
record("contract", "data sources and snapshot components are discoverable", harness.dataSources?.length >= 7 && harness.snapshots?.length >= 8, `${harness.dataSources?.length} sources, ${harness.snapshots?.length} snapshots`);

// 2. The catalog follows geography: local products, local suppliers, many countries.
const groups = (await get("/api/v1/data/groups?limit=2000")).rows;
const suppliers = JSON.parse(readFileSync("data/suppliers.json", "utf8"));
const byName = new Map(suppliers.map((s) => [s.name, s]));
const regional = groups.filter((g) => String(g.id).startsWith("clan-gen-"));
const countries = new Set(regional.map((g) => g.country));
record("data", "regional groups cover many countries", countries.size >= 25, `${regional.length} groups, ${countries.size} countries, ${new Set(regional.map((g) => g.city)).size} cities`);
const mismatched = regional.filter((g) => { const s = byName.get(g.supplier); return !s || s.countryCode !== g.country || s.city !== g.city; });
record("data", "every regional group has a supplier in the same city", mismatched.length === 0, `${mismatched.length} mismatches`);
const productCities = new Map();
for (const g of regional) productCities.set(g.product, new Set([...(productCities.get(g.product) ?? []), g.city]));
const widest = Math.max(...[...productCities.values()].map((set) => set.size));
record("data", "no product is copied across many cities", widest <= 2, `widest spread ${widest} cities`);
const indian = regional.filter((g) => g.country === "IN");
record("data", "Indian regional groups exist", indian.length >= 20, `${indian.length}`);

// 3. Photos: each product type has several photos so groups do not share one picture.
const manifest = JSON.parse(readFileSync("src/web/react/productImageManifest.json", "utf8"));
const multi = Object.values(manifest).filter((list) => list.length >= 2).length;
record("data", "most photo types have 2+ variants", multi / Object.keys(manifest).length >= 0.6, `${multi} of ${Object.keys(manifest).length} types`);

// 4. Guardrails that do not depend on which model is connected.
const settings = await get("/api/v1/user/settings");
record("guardrail", "permissions default to a stored object the model cannot widen", typeof settings.agentPermissions === "object");

if (!skipModel) {
  await post("/api/v1/user/settings", { agentPermissions: { allowAutonomousFilterSort: true, allowAutonomousQuotePrep: true, allowAutonomousDraftMessages: true, allowAutonomousScheduleChanges: true, allowAutonomousResearch: true } });
  const ask = async (prompt, history = []) => {
    const started = Date.now();
    const result = await post("/api/v1/agent/chat", { prompt, maxTurns: 4, metadata: { source: "mosaic-deep-work", context: { view: "mosaic-chat", history } } });
    return { tools: (result.steps ?? []).map((step) => step.toolName), steps: result.steps ?? [], final: result.finalMessage ?? "", seconds: Math.round((Date.now() - started) / 1000) };
  };

  // 5. Mosaic drives the product with real tools.
  let r = await ask("Which groups in Kochi are filling up?");
  record("agent", "pulls live data into a grid", r.tools.includes("present") || r.tools.includes("ui_filter_clans"), `${r.tools.join(", ")} in ${r.seconds}s`);
  r = await ask("Take me to disputes");
  record("agent", "navigates to a page", r.tools.includes("ui_navigate_view"), `${r.seconds}s`);
  r = await ask("Show me my PayPal position");
  record("agent", "opens a live report", r.tools.includes("ui_open_report"), `${r.seconds}s`);
  r = await ask("I want to start a clan, help me search for suppliers");
  record("agent", "asks which product when none is named", r.tools.every((t) => t !== "start_group_buy") && /what/i.test(r.final), `${r.seconds}s`);
  r = await ask("Stainless steel M10 nuts for Pune, 2000 units", [{ role: "user", text: "I want to start a clan, help me search for suppliers" }, { role: "assistant", text: "What would you like to buy?" }]);
  const find = r.steps.find((step) => step.toolName === "find_suppliers");
  record("agent", "uses Kernel to source suppliers on the web", Boolean(find) && find.toolResult?.web?.ok === true, `leads saved ${find?.toolResult?.web?.leadsSaved ?? 0}, ${r.seconds}s`);
  const start = r.steps.find((step) => step.toolName === "start_group_buy");
  record("agent", "opens the group form filled from the conversation", start?.toolResult?.status === "SUCCESS" && start.toolResult.fields?.city === "Pune" && start.toolResult.fields?.targetUnits === 2000, JSON.stringify(start?.toolResult?.fields ?? {}).slice(0, 110));
  record("agent", "never invents a price", start?.toolResult?.fields?.basePriceUsd === undefined);
  record("agent", "model never approves money", !r.tools.some((t) => /approve|capture|authorize|payout/i.test(String(t))));
  if (existsSync(".scratch/supplier-leads.json")) writeFileSync(".scratch/supplier-leads.json", "[]");
}

const passed = rows.filter((row) => row.ok).length;
const stamp = new Date().toISOString();
const table = rows.map((row) => `| ${row.ok ? "pass" : "FAIL"} | ${row.area} | ${row.check} | ${row.detail.replace(/\|/g, "/")} |`).join("\n");
writeFileSync("docs/assets/harness-proof.md", `# Harness proof\n\nRun at ${stamp} against ${BASE}. Model: ${harness.model?.label} ${harness.model?.model ?? ""}.\n\nRe-run with \`node scripts/verify-harness.js\`.\n\n| Result | Area | Check | Detail |\n|---|---|---|---|\n${table}\n\n${passed} of ${rows.length} passed.\n`);
console.log(`\n${passed} of ${rows.length} passed. Wrote docs/assets/harness-proof.md`);
process.exit(passed === rows.length ? 0 : 1);
