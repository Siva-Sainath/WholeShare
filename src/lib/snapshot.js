import { querySource } from "./data-sources.js";

// A snapshot is one view of the platform frozen as data plus a ready-to-share page.
// External agents call it over REST, MCP or WebMCP and hand the link or HTML to their own user.

const COMPONENTS = {
  groups: { source: "groups", title: "Buying groups", columns: ["name", "city", "category", "unitPriceUsd", "tierDiscountPct", "currentUnits", "targetUnits", "fillPct", "status"] },
  suppliers: { source: "suppliers", title: "Suppliers", columns: ["name", "city", "country", "categories", "leadTimeDays", "minOrderUnits", "trustScore", "acceptsPayPal"] },
  claims: { source: "claims", title: "Damage claims", columns: ["id", "product", "city", "damagedUnits", "claimedUsd", "status", "createdAt"] },
  "claims-board": { source: "claims", title: "Claims board", columns: ["id", "product", "damagedUnits", "claimedUsd", "status"], group: "status" },
  shipments: { source: "shipments", title: "Shipments", columns: ["product", "carrier", "tracking", "expectedAt", "deliveredAt", "status"] },
  schedule: { source: "shipments", title: "Delivery schedule", columns: ["product", "carrier", "shippedAt", "expectedAt", "inspectionEndsAt", "status"] },
  ledger: { source: "ledger", title: "My pledges", columns: ["group", "member", "units", "authorizedUsd", "status"] },
  invoices: { source: "paypal_invoices", title: "PayPal invoices", columns: ["number", "billedTo", "amountUsd", "dueUsd", "status", "issuedAt"] },
  members: { source: "members", title: "Group members", columns: ["group", "member", "units", "authorizedUsd", "status"] }
};

export function listSnapshotComponents() {
  return Object.entries(COMPONENTS).map(([id, c]) => ({ id, title: c.title, source: c.source }));
}

const escapeHtml = (value) => String(value ?? "").replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[ch]);

export async function buildSnapshot(componentId, { filter = [], limit = 100 } = {}) {
  const spec = COMPONENTS[componentId];
  if (!spec) throw new Error(`Unknown component '${componentId}'. Known components: ${Object.keys(COMPONENTS).join(", ")}.`);
  const result = await querySource(spec.source, { filter, limit: Math.min(Number(limit) || 100, 500) });
  const first = result.rows[0] ?? {};
  const columns = spec.columns.filter((column) => column in first);
  const rows = result.rows.map((row) => Object.fromEntries(columns.map((column) => [column, row[column] ?? null])));
  const summary = { total: result.total, shown: rows.length };
  if (spec.group) {
    summary.byStage = rows.reduce((acc, row) => ({ ...acc, [String(row[spec.group])]: (acc[String(row[spec.group])] ?? 0) + 1 }), {});
  }
  return { component: componentId, title: spec.title, generatedAt: new Date().toISOString(), source: result.label, columns, rows, summary };
}

export function snapshotCsv(snapshot) {
  const cell = (value) => {
    const text = String(value ?? "");
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  return [snapshot.columns.join(","), ...snapshot.rows.map((row) => snapshot.columns.map((column) => cell(row[column])).join(","))].join("\n");
}

const label = (column) => column.replace(/Usd$/, " (USD)").replace(/Pct$/, " %").replace(/([a-z])([A-Z])/g, "$1 $2").replace(/^./, (c) => c.toUpperCase());

export function snapshotHtml(snapshot) {
  const head = snapshot.columns.map((column) => `<th>${escapeHtml(label(column))}</th>`).join("");
  const body = snapshot.rows.map((row) => `<tr>${snapshot.columns.map((column) => `<td>${escapeHtml(row[column])}</td>`).join("")}</tr>`).join("");
  const stages = snapshot.summary.byStage ? `<p class="stages">${Object.entries(snapshot.summary.byStage).map(([stage, count]) => `<span>${escapeHtml(stage)} <b>${count}</b></span>`).join("")}</p>` : "";
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(snapshot.title)}</title>
<style>:root{color-scheme:light}body{margin:0;padding:24px;background:#FAF8F3;color:#0F1F2E;font:14px/1.5 Geist,-apple-system,Segoe UI,sans-serif}main{max-width:1100px;margin:0 auto;background:#fff;border:1px solid #E7E2D8;border-radius:16px;padding:20px;overflow:auto}h1{margin:0 0 4px;font-size:20px}p.meta{margin:0 0 16px;color:#5C6A79;font-size:12px}table{width:100%;border-collapse:collapse}th{text-align:left;font-size:12px;color:#5C6A79;padding:8px 10px;border-bottom:1px solid #E7E2D8;background:#FAF8F3}td{padding:8px 10px;border-bottom:1px solid #F0ECE3}.stages span{display:inline-block;margin-right:8px;padding:2px 10px;border-radius:999px;background:#EBF4FA;color:#0070BA;font-size:12px}footer{margin-top:16px;color:#5C6A79;font-size:12px}</style></head>
<body><main><h1>${escapeHtml(snapshot.title)}</h1><p class="meta">${snapshot.summary.shown} of ${snapshot.summary.total} rows · ${escapeHtml(snapshot.generatedAt)}</p>${stages}<table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table><footer>WholeShare snapshot. Payments powered by PayPal.</footer></main></body></html>`;
}
