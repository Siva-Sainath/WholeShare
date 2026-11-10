// Acts as an outside agent in a real browser. It discovers tools on document.modelContext, drives AG Grid through them,
// then opens Insights and calls AG Studio's own agent framework tools. Usage: node scripts/verify-webmcp-tools.js
import puppeteer from "puppeteer";

const BASE = process.env.BASE_URL || "http://localhost:3000";
const results = [];
const check = (name, ok, detail = "") => { results.push(ok); console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`); };

const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox"], defaultViewport: { width: 1440, height: 1000 } });
const page = await browser.newPage();
const errors = [];
page.on("pageerror", (error) => errors.push(String(error).slice(0, 160)));
await page.goto(BASE, { waitUntil: "domcontentloaded" });
await page.evaluate(() => localStorage.setItem("wholeshare_onboarding_confirmed", "true"));
await page.goto(`${BASE}/#discover`, { waitUntil: "domcontentloaded" });
await new Promise((r) => setTimeout(r, 3000));

const call = (name, args = {}) => page.evaluate(async (n, a) => {
  try { return { ok: true, value: await window.__webmcpCall(n, a) }; } catch (error) { return { ok: false, error: String(error.message || error) }; }
}, name, args);
const list = () => page.evaluate(() => window.__webmcpList().map((t) => t.name));

const context = await page.evaluate(() => ({ hasContext: Boolean(document.modelContext), hasList: typeof document.modelContext?.listTools === "function" }));
check("document.modelContext is present for visiting agents", context.hasContext && context.hasList);
let names = await list();
check("app tools are discoverable", ["wholeshare_describe", "wholeshare_query_data", "wholeshare_show_data", "wholeshare_find_suppliers", "wholeshare_snapshot", "grid_list"].every((n) => names.includes(n)), `${names.length} tools`);

let r = await call("wholeshare_describe");
check("describe returns screens, sources and guardrails", r.ok && r.value.screens.length >= 6 && r.value.dataSources.length >= 7 && r.value.guardrails.length >= 3);

r = await call("wholeshare_query_data", { source: "groups", filter: [{ field: "city", op: "eq", value: "Kochi" }], limit: 5 });
check("agent reads live rows by filter", r.ok && r.value.rows.length > 0 && r.value.rows.every((row) => row.city === "Kochi"), `${r.value?.total} Kochi groups`);

r = await call("wholeshare_show_data", { source: "groups", title: "Kochi groups", filter: [{ field: "city", op: "eq", value: "Kochi" }] });
await new Promise((r2) => setTimeout(r2, 3500));
names = await list();
check("showing data puts a grid on screen", r.ok && (await call("grid_list")).value?.length >= 1, JSON.stringify((await call("grid_list")).value));

const gridId = (await call("grid_list")).value?.[0]?.id;
r = await call("grid_describe", { gridId });
check("grid_describe lists columns and state", r.ok && r.value.columns.length >= 5, `${r.value?.columns?.length} columns, ${r.value?.rowsShown} rows`);
const before = (await call("grid_describe", { gridId })).value.rowsShown;
r = await call("grid_filter", { gridId, column: "name", operator: "contains", value: "Cardamom" });
check("grid_filter narrows the grid the user sees", r.ok && r.value.rowsShown > 0 && r.value.rowsShown < before, `${before} to ${r.value?.rowsShown} rows`);
r = await call("grid_filter", { gridId, column: "fillPct", operator: "greaterThan", value: 80 });
check("a second filter on a number column stacks", r.ok && r.value.rowsShown >= 0 && Object.keys(r.value.filters).length === 2, `${r.value?.rowsShown} rows`);
r = await call("grid_sort", { gridId, column: "fillPct", direction: "desc" });
const rows = await call("grid_get_rows", { gridId, limit: 5 });
const fills = rows.value?.rows?.map((row) => row.fillPct) ?? [];
check("grid_sort orders the visible rows", r.ok && fills.every((v, i) => i === 0 || fills[i - 1] >= v), fills.join(", "));
r = await call("grid_group_by", { gridId, columns: ["status"] });
check("grid_group_by uses AG Grid row grouping", r.ok && r.value.groupedBy[0] === "status");
await call("grid_group_by", { gridId, columns: [] });
r = await call("grid_clear_filters", { gridId });
check("grid_clear_filters resets", r.ok);
r = await call("grid_export_csv", { gridId });
check("grid_export_csv returns the data", r.ok && r.value.csv.includes("Kochi"));
r = await call("grid_filter", { gridId, column: "nonsense", value: "x" });
check("a bad column is refused with a helpful error", !r.ok && /No column/.test(r.error));

r = await call("wholeshare_snapshot", { component: "claims-board" });
check("snapshot returns share links", r.ok && r.value.links.html.includes("format=html"));

await page.goto(`${BASE}/#insights`, { waitUntil: "domcontentloaded" });
await new Promise((r2) => setTimeout(r2, 6000));
names = await list();
const studio = names.filter((n) => n.startsWith("studio_"));
check("opening Insights registers AG Studio agent tools", studio.length >= 8, studio.join(", "));
r = await call("studio_view_report");
check("studio_view_report reads the live dashboard", r.ok && JSON.stringify(r.value).length > 200, `${JSON.stringify(r.value).length} chars`);
r = await call("studio_view_schema");
check("studio_view_schema lists the data model", r.ok && /groups|claims/.test(JSON.stringify(r.value)));
await page.goto(`${BASE}/#discover`, { waitUntil: "domcontentloaded" });
await new Promise((r2) => setTimeout(r2, 2500));
names = await list();
check("leaving Insights unregisters the Studio tools", !names.some((n) => n.startsWith("studio_")));
check("no page errors during the run", errors.length === 0, errors.join(" | "));
await browser.close();
const passed = results.filter(Boolean).length;
console.log(`\n${passed} of ${results.length} passed`);
process.exit(passed === results.length ? 0 : 1);
