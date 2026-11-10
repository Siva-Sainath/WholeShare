// Golden prompts for Mosaic. Each one passes or fails on the tools it actually called, never on its prose.
// Needs the server and the local model running. Usage: node scripts/verify-mosaic.js [--only=3]
const BASE = process.env.BASE_URL || "http://localhost:3000";

const CASES = [
  { prompt: "Which Austin groups are closest to filling up?", expect: (t) => (t.includes("present") || t.includes("query")) },
  { prompt: "List my open PayPal invoices", expect: (t) => (t.includes("present") || t.includes("query")) },
  { prompt: "Show my pledges", expect: (t) => (t.includes("present") || t.includes("query")) },
  { prompt: "Show my claims that are still drafts", expect: (t) => (t.includes("present") || t.includes("query")) },
  { prompt: "Open the Ethiopian Yirgacheffe coffee group in Austin", expect: (t) => t.includes("ui_open_group") || t.includes("present") || t.includes("query") },
  { prompt: "I want to confirm delivery for my kraft shipping boxes group", expect: (t) => t.includes("ui_open_my_group") },
  { prompt: "Take me to disputes", expect: (t) => t.includes("ui_navigate_view") },
  { prompt: "Find groups in Portland", expect: (t) => t.includes("ui_filter_clans") || (t.includes("present") || t.includes("query")) },
  { prompt: "Check the supplier for the Yirgacheffe coffee on the web", expect: (t) => t.includes("kernel_research_web_fact") || t.includes("kernel_read_supplier_site") || t.includes("find_suppliers") || t.includes("verify_supplier_credibility") },
  { prompt: "Prepare a pledge for 100 units of the Austin Yirgacheffe coffee group", expect: (t) => t.includes("join_group") || t.includes("prepare_pledge_quote") },
  { prompt: "What is in my escrow ledger?", expect: (t) => t.includes("query_escrow_ledger") || (t.includes("present") || t.includes("query")) },
  { prompt: "Show the shipments", expect: (t) => (t.includes("present") || t.includes("query")) || t.includes("ui_navigate_view") },
  { prompt: "Move the corrugated boxes delivery up two days", expect: (t) => t.includes("schedule_move_delivery") },
  { prompt: "Show me my PayPal position", expect: (t) => t.includes("ui_open_report") },
  { prompt: "What is arriving soon? Show me the delivery schedule", expect: (t) => (t.includes("present") || t.includes("query")) },
  { prompt: "Show me the claims board", expect: (t) => (t.includes("present") || t.includes("query")) },
  { prompt: "Find me suppliers for stainless steel M10 nuts in India", expect: (t) => t.includes("find_suppliers") },
  { prompt: "Source new suppliers for cashew kernels from the web", expect: (t) => t.includes("find_suppliers") },
  { prompt: "I want to start a group to buy cotton canvas in Surat, 800 units", expect: (t) => t.includes("find_suppliers") && t.includes("start_group_buy") },
  { prompt: "I want to start a clan, help me search for suppliers", expect: (t, final) => !t.includes("start_group_buy") && /what/i.test(final), note: "no product named: must ask which product" },
  { prompt: "Read boltdepot.com and tell me the price and minimum order for stainless steel hex nuts", expect: (t) => t.includes("kernel_read_supplier_site") },
  { prompt: "Pledge something", expect: (t, final) => t.length === 0 && /(\?|which|could you|please)/i.test(final), note: "ambiguous: must ask a question and call no tool" }
];

async function post(path, body) {
  const response = await fetch(`${BASE}${path}`, { method: "POST", headers: { "content-type": "application/json", origin: BASE }, body: JSON.stringify(body) });
  return response.json();
}

const only = Number((process.argv.find((arg) => arg.startsWith("--only=")) || "").split("=")[1]) || null;
const allowed = { agentPermissions: { allowAutonomousFilterSort: true, allowAutonomousQuotePrep: true, allowAutonomousDraftMessages: true, allowAutonomousScheduleChanges: true, allowAutonomousResearch: true } };
await post("/api/v1/user/settings", allowed);

const results = [];
for (const [index, item] of CASES.entries()) {
  if (only && index + 1 !== only) continue;
  const started = Date.now();
  let tools = [];
  let final = "";
  let error = "";
  try {
    const payload = await post("/api/v1/agent/chat", { prompt: item.prompt, maxTurns: 6, metadata: { source: "mosaic-deep-work", context: {} } });
    tools = (payload.steps || []).map((step) => step.toolName).filter(Boolean);
    final = payload.finalMessage || "";
  } catch (cause) {
    error = cause.message;
  }
  const ok = !error && item.expect(tools, final);
  const seconds = Math.round((Date.now() - started) / 100) / 10;
  results.push({ n: index + 1, ok, seconds });
  console.log(`${ok ? "PASS" : "FAIL"} ${String(index + 1).padStart(2)} ${seconds}s  ${item.prompt}  [${tools.join(", ") || "no tools"}]${error ? " " + error : ""}`);
}
const passed = results.filter((r) => r.ok).length;
const sorted = results.map((r) => r.seconds).sort((a, b) => a - b);
console.log(`\n${passed} of ${results.length} passed, median ${sorted[Math.floor(sorted.length / 2)] ?? 0}s`);
process.exitCode = passed >= Math.ceil(results.length * 0.85) ? 0 : 1;
