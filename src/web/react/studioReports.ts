// AG Studio data model and the four shipped report pages.
// Sources come from the server registry (/api/v1/data/<source>), so Studio, AG Grid and Mosaic read the same rows.
// Reports are plain AgReportState objects. Open Edit mode to change them and Save to keep your version.

type Row = Record<string, unknown>;

const USD = { format: new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }) };

async function loadRows(source: string, limit = 20000): Promise<Row[]> {
  const response = await fetch(`/api/v1/data/${source}?limit=${limit}`, { headers: { accept: "application/json" } });
  const payload = (await response.json()) as { rows?: Row[]; error?: string };
  if (!response.ok || !Array.isArray(payload.rows)) throw new Error(payload.error ?? `Could not load ${source}.`);
  return payload.rows;
}

// Raw enums such as PACKAGING_MATERIALS are for the database. Reports show "Packaging materials".
const ENUM_FIELDS = ["category", "status", "groupStatus"];
export function pretty(rows: Row[]): Row[] {
  return rows.map((row) => {
    let next: Row | null = typeof row.fillPct === "number" && row.fillPct > 100 ? { ...row, fillPct: 100 } : null;
    for (const field of ENUM_FIELDS) {
      const value = row[field];
      if (typeof value === "string" && /^[A-Z][A-Z0-9_]+$/.test(value)) {
        const text = value.toLowerCase().replace(/_/g, " ");
        next = next ?? { ...row };
        next[field] = text.charAt(0).toUpperCase() + text.slice(1);
      }
    }
    return next ?? row;
  });
}

function dates(rows: Row[], fields: string[]): Row[] {
  return rows.map((row) => {
    const next: Row = { ...row };
    for (const field of fields) next[field] = row[field] ? new Date(String(row[field])) : null;
    return next;
  });
}

const DATE_FIELDS: Record<string, string[]> = {
  claims: ["createdAt"],
  shipments: ["shippedAt", "expectedAt", "deliveredAt", "inspectionEndsAt"],
  invoices: ["issuedAt"]
};
const REGISTRY_ID: Record<string, string> = { invoices: "paypal_invoices" };

// Fresh rows for one Studio table, shaped exactly like the rows it was first loaded with.
export async function fetchSourceRows(tableId: string): Promise<Row[]> {
  const rows = await loadRows(REGISTRY_ID[tableId] ?? tableId, tableId === "invoices" ? 200 : 20000);
  return pretty(derive(tableId, DATE_FIELDS[tableId] ? dates(rows, DATE_FIELDS[tableId]) : rows));
}

// Flags Studio can sum. Derived here so they stay correct whenever the rows refresh.
function derive(tableId: string, rows: Row[]): Row[] {
  if (tableId !== "shipments") return rows;
  return rows.map((row) => {
    const delivered = row.status === "DELIVERED" ? 1 : 0;
    const expected = row.expectedAt instanceof Date ? row.expectedAt.getTime() : null;
    const done = row.deliveredAt instanceof Date ? row.deliveredAt.getTime() : null;
    return { ...row, delivered, delayed: row.status === "DELAYED" ? 1 : 0, inTransit: row.status === "IN_TRANSIT" ? 1 : 0, onTime: delivered && expected !== null && done !== null && done <= expected + 36 * 3600 * 1000 ? 1 : 0 };
  });
}

export interface StudioLoad {
  data: Record<string, unknown>;
  counts: Record<string, number>;
  invoiceError: string | null;
}

export async function loadStudioData(): Promise<StudioLoad> {
  const [groups, members, ledger, claims, shipments] = await Promise.all([loadRows("groups"), loadRows("members"), loadRows("ledger"), loadRows("claims"), loadRows("shipments")]);
  let invoices: Row[] = [];
  let invoiceError: string | null = null;
  try {
    invoices = await loadRows("paypal_invoices", 200);
  } catch (cause) {
    invoiceError = cause instanceof Error ? cause.message : "PayPal invoices are unavailable.";
  }

  const data = {
    description:
      "WholeShare B2B group buying on PayPal. Buying groups pool orders to reach supplier price tiers. Members pledge units and PayPal holds the funds until delivery. Demo groups and members are generated. PayPal invoices are live from the PayPal sandbox. Never sum amounts across different currencies; everything here is USD.",
    sources: [
      {
        id: "groups",
        name: "Buying groups",
        description: "Every buying group in the catalog. unitPriceUsd already includes the tier discount reached.",
        primaryKeyField: "id",
        transactions: "all" as const,
        data: pretty(groups),
        fields: [
          { id: "id", name: "Group ID", format: "textFormat" as const, hidden: true },
          { id: "name", name: "Group", format: "textFormat" as const },
          { id: "product", name: "Product", format: "textFormat" as const },
          { id: "category", name: "Category", format: "textFormat" as const },
          { id: "city", name: "City", format: "textFormat" as const },
          { id: "country", name: "Country", format: "textFormat" as const },
          { id: "status", name: "Status", format: "textFormat" as const },
          { id: "currentUnits", name: "Units pledged", format: "integerFormat" as const },
          { id: "targetUnits", name: "Units target", format: "integerFormat" as const },
          { id: "fillPct", name: "Fill (%)", format: "integerFormat" as const },
          { id: "listPriceUsd", name: "List price", format: "currencyFormat" as const, formatOptions: USD },
          { id: "tierDiscountPct", name: "Tier discount (%)", format: "integerFormat" as const },
          { id: "unitPriceUsd", name: "Unit price", format: "currencyFormat" as const, formatOptions: USD },
          { id: "supplier", name: "Supplier", format: "textFormat" as const }
        ]
      },
      {
        id: "members",
        name: "Group members",
        description: "Pledges per member across all groups. Pledges across all groups.",
        primaryKeyField: "id",
        transactions: "all" as const,
        data: pretty(members),
        fields: [
          { id: "id", name: "Pledge ID", format: "textFormat" as const, hidden: true },
          { id: "groupId", name: "Group ID", format: "textFormat" as const, hidden: true },
          { id: "member", name: "Member", format: "textFormat" as const },
          { id: "units", name: "Units", format: "integerFormat" as const },
          { id: "authorizedUsd", name: "Authorized", format: "currencyFormat" as const, formatOptions: USD },
          { id: "status", name: "Status", format: "textFormat" as const }
        ]
      },
      {
        id: "ledger",
        name: "My pledges",
        description: "Pledges in the groups you joined, from the local ledger. Not verified against PayPal unless a PayPal order id is present.",
        primaryKeyField: "id",
        transactions: "all" as const,
        data: pretty(ledger),
        fields: [
          { id: "id", name: "ID", format: "textFormat" as const, hidden: true },
          { id: "groupId", name: "Group ID", format: "textFormat" as const, hidden: true },
          { id: "group", name: "Group", format: "textFormat" as const },
          { id: "groupStatus", name: "Group status", format: "textFormat" as const },
          { id: "member", name: "Member", format: "textFormat" as const },
          { id: "units", name: "Units", format: "integerFormat" as const },
          { id: "authorizedUsd", name: "Held (USD)", format: "currencyFormat" as const, formatOptions: USD },
          { id: "status", name: "Status", format: "textFormat" as const }
        ]
      },
      {
        id: "claims",
        name: "Damage claims",
        description: "Damage claims and their approval status.",
        primaryKeyField: "id",
        transactions: "all" as const,
        data: pretty(dates(claims, ["createdAt"])),
        fields: [
          { id: "id", name: "Claim", format: "textFormat" as const },
          { id: "groupId", name: "Group ID", format: "textFormat" as const, hidden: true },
          { id: "memberId", name: "Member ID", format: "textFormat" as const },
          { id: "damagedUnits", name: "Damaged units", format: "integerFormat" as const },
          { id: "claimedUsd", name: "Claimed", format: "currencyFormat" as const, formatOptions: USD },
          { id: "status", name: "Status", format: "textFormat" as const },
          { id: "createdAt", name: "Filed", format: "dateFormat" as const }
        ]
      },
      {
        id: "shipments",
        name: "Shipments",
        description: "Shipments with carrier tracking numbers and inspection windows.",
        primaryKeyField: "id",
        transactions: "all" as const,
        data: pretty(derive("shipments", dates(shipments, ["shippedAt", "expectedAt", "deliveredAt", "inspectionEndsAt"]))),
        fields: [
          { id: "id", name: "Shipment", format: "textFormat" as const, hidden: true },
          { id: "groupId", name: "Group ID", format: "textFormat" as const, hidden: true },
          { id: "product", name: "Product", format: "textFormat" as const },
          { id: "carrier", name: "Carrier", format: "textFormat" as const },
          { id: "quantity", name: "Quantity", format: "integerFormat" as const },
          { id: "shippedAt", name: "Dispatched", format: "dateFormat" as const },
          { id: "expectedAt", name: "Expected", format: "dateFormat" as const },
          { id: "deliveredAt", name: "Delivered", format: "dateFormat" as const },
          { id: "inspectionEndsAt", name: "Inspection ends", format: "dateFormat" as const },
          { id: "status", name: "Status", format: "textFormat" as const },
          { id: "delivered", name: "Delivered flag", format: "integerFormat" as const, hidden: true },
          { id: "delayed", name: "Delayed flag", format: "integerFormat" as const, hidden: true },
          { id: "inTransit", name: "In transit flag", format: "integerFormat" as const, hidden: true },
          { id: "onTime", name: "On time flag", format: "integerFormat" as const, hidden: true }
        ]
      },
      {
        id: "invoices",
        name: "PayPal invoices",
        description: "Live invoices from the PayPal sandbox account. These are real PayPal invoice objects.",
        primaryKeyField: "id",
        transactions: "all" as const,
        data: pretty(dates(invoices, ["issuedAt"])),
        fields: [
          { id: "id", name: "Invoice ID", format: "textFormat" as const, hidden: true },
          { id: "number", name: "Invoice", format: "textFormat" as const },
          { id: "status", name: "Status", format: "textFormat" as const },
          { id: "issuedAt", name: "Issued", format: "dateFormat" as const },
          { id: "billedTo", name: "Billed to", format: "textFormat" as const },
          { id: "amountUsd", name: "Amount", format: "currencyFormat" as const, formatOptions: USD },
          { id: "dueUsd", name: "Due", format: "currencyFormat" as const, formatOptions: USD },
          { id: "note", name: "Note", format: "textFormat" as const }
        ]
      }
    ],
    relationships: [
      { id: "members-to-groups", type: "many-to-one" as const, source: { tableId: "members", fieldId: "groupId" }, target: { tableId: "groups", fieldId: "id" } },
      { id: "claims-to-groups", type: "many-to-one" as const, source: { tableId: "claims", fieldId: "groupId" }, target: { tableId: "groups", fieldId: "id" } },
      { id: "shipments-to-groups", type: "many-to-one" as const, source: { tableId: "shipments", fieldId: "groupId" }, target: { tableId: "groups", fieldId: "id" } },
      { id: "ledger-to-groups", type: "many-to-one" as const, source: { tableId: "ledger", fieldId: "groupId" }, target: { tableId: "groups", fieldId: "id" } }
    ],
    expressions: [
      {
        id: "fillRate",
        name: "Fill rate",
        description: "Units pledged divided by units targeted, across the groups in view.",
        isMeasure: true,
        format: "percentageFormat",
        formatOptions: { format: "#,##0.0%" },
        expression: { operator: "divide", inputs: [{ id: "groups.currentUnits", aggregation: "sum" }, { id: "groups.targetUnits", aggregation: "sum" }] }
      },
      {
        id: "onTimeRate",
        name: "On-time rate",
        description: "Delivered shipments that arrived within 36 hours of the expected date, divided by all delivered shipments.",
        isMeasure: true,
        format: "percentageFormat",
        formatOptions: { format: "#,##0.0%" },
        expression: { operator: "divide", inputs: [{ id: "shipments.onTime", aggregation: "sum" }, { id: "shipments.delivered", aggregation: "sum" }] }
      },
      {
        id: "delayRate",
        name: "Delay rate",
        description: "Shipments flagged delayed by the carrier divided by all shipments.",
        isMeasure: true,
        format: "percentageFormat",
        formatOptions: { format: "#,##0.0%" },
        expression: { operator: "divide", inputs: [{ id: "shipments.delayed", aggregation: "sum" }, { id: "shipments.id", aggregation: "count" }] }
      },
      {
        id: "collectionRate",
        name: "Invoices collected",
        description: "Share of invoiced amount that has been paid: (amount minus due) divided by amount.",
        isMeasure: true,
        format: "percentageFormat",
        formatOptions: { format: "#,##0.0%" },
        expression: {
          operator: "divide",
          inputs: [{ operator: "subtract", inputs: [{ id: "invoices.amountUsd", aggregation: "sum" }, { id: "invoices.dueUsd", aggregation: "sum" }] }, { id: "invoices.amountUsd", aggregation: "sum" }]
        }
      }
    ]
  };

  return {
    data,
    counts: { groups: groups.length, members: members.length, pledges: ledger.length, claims: claims.length, shipments: shipments.length, invoices: invoices.length },
    invoiceError
  };
}

// Report pages follow AG Studio's own fulfilment dashboard: a title, KPI tiles, gauges, a donut or pie, a ranked bar
// and a grid, on a 24 column canvas. Measures are the named expressions above.
const text = (id: string, label: string) => ({ id, type: "text", dataMapping: {}, format: { style: { text: label, typography: { fontWeight: "bold", fontSize: 22 } } } });

const kpi = (id: string, label: string, field: string, aggregation?: string) => ({
  id,
  type: "value",
  dataMapping: { value: [aggregation ? { id: field, aggregation } : { id: field }] },
  format: { style: { label: { enabled: true, text: label, typography: { fontSize: 16, fontWeight: "normal", fontStyle: "normal" } } } }
});

const gauge = (id: string, title: string, measure: string, caption: string) => ({
  id,
  type: "radial-gauge",
  dataMapping: { value: [{ id: measure }] },
  format: { title: { enabled: true, text: title }, style: { label: { enabled: true }, secondaryLabel: { enabled: true, text: caption }, scaleLabel: { enabled: true, min: 0, max: 1 } } }
});

const pie = (id: string, title: string, category: string, value: string, aggregation: string, kind: "pie-chart" | "donut-chart" = "donut-chart") => ({
  id,
  type: kind,
  dataMapping: { categoryKey: [{ id: category }], valueKey: [{ id: value, aggregation }], tooltipKey: [] },
  format: { title: { enabled: true, text: title }, style: { theme: { common: { legend: { enabled: true, position: "right" } } } } }
});

const bars = (id: string, title: string, category: string, value: string, aggregation?: string) => ({
  id,
  type: "bar-chart-grouped",
  dataMapping: { categoryKey: [{ id: category }], valueKey: [aggregation ? { id: value, aggregation } : { id: value }] },
  sort: [{ field: { id: value, ...(aggregation ? { aggregation } : {}) }, direction: "desc" }],
  format: { title: { enabled: true, text: title } }
});

const grid = (id: string, title: string, cols: Array<string | { id: string; aggregation: string }>, sortField?: string, direction: "asc" | "desc" = "desc") => ({
  id,
  type: "grid",
  dataMapping: { cols: cols.map((col) => (typeof col === "string" ? { id: col } : col)) },
  ...(sortField ? { sort: [{ field: { id: sortField }, direction }] } : {}),
  format: { title: { enabled: true, text: title } }
});

function page(id: string, name: string, widgets: Array<{ id: string }>, placement: Record<string, [number, number, number, number]>, filters: string[]) {
  return {
    id,
    name,
    widgets: Object.fromEntries(widgets.map((widget) => [widget.id, widget])),
    widgetLayout: Object.fromEntries(Object.entries(placement).map(([key, [x, y, w, h]]) => [key, { xTrack: x, yTrack: y, xSpan: w, ySpan: h }])),
    filter: { page: filters.map((field) => ({ field: { id: field }, view: { expanded: false } })) }
  };
}

export const STUDIO_REPORT_STATE: any = {
  version: "3.1.0",
  selectedPageId: "page-paypal",
  panels: { ai: { collapsed: true }, filters: { collapsed: true }, edit: { collapsed: true }, data: { collapsed: true } },
  pages: [
    page(
      "page-paypal",
      "PayPal position",
      [
        text("t", "Money held by PayPal for your groups and invoices still waiting to be paid"),
        kpi("k-held", "Held on PayPal", "ledger.authorizedUsd", "sum"),
        kpi("k-open", "Open invoice balance", "invoices.dueUsd", "sum"),
        kpi("k-invoices", "PayPal invoices", "invoices.id", "count"),
        bars("b-buyer", "Largest open invoices", "invoices.number", "invoices.dueUsd", "sum"),
        pie("p-status", "Pledges by status", "ledger.status", "ledger.id", "count"),
        bars("b-held", "Held on PayPal by group", "ledger.group", "ledger.authorizedUsd", "sum"),
        grid("g-invoices", "PayPal invoices", ["invoices.number", "invoices.billedTo", "invoices.status", "invoices.amountUsd", "invoices.dueUsd", "invoices.issuedAt"], "invoices.dueUsd")
      ],
      { t: [0, 0, 24, 4], "k-held": [0, 4, 8, 6], "k-open": [8, 4, 8, 6], "k-invoices": [16, 4, 8, 6], "b-buyer": [0, 10, 8, 16], "p-status": [8, 10, 8, 16], "b-held": [16, 10, 8, 16], "g-invoices": [0, 26, 24, 22] },
      ["invoices.status", "ledger.groupStatus"]
    ),
    page(
      "page-demand",
      "Demand and savings",
      [
        text("t", "How full each group is and what buyers save at the tier reached"),
        kpi("k-units", "Units pledged", "groups.currentUnits", "sum"),
        kpi("k-groups", "Buying groups", "groups.id", "count"),
        kpi("k-discount", "Average tier discount (%)", "groups.tierDiscountPct", "avg"),
        gauge("g-fill", "Fill rate", "fillRate", "of target units pledged"),
        pie("p-status2", "Groups by status", "groups.status", "groups.id", "count", "pie-chart"),
        bars("b-category", "Units pledged by category", "groups.category", "groups.currentUnits", "sum"),
        grid("g-groups", "Fullest buying groups", ["groups.name", "groups.city", "groups.status", "groups.fillPct", "groups.unitPriceUsd", "groups.tierDiscountPct"], "groups.fillPct")
      ],
      { t: [0, 0, 24, 4], "k-units": [0, 4, 8, 6], "k-groups": [8, 4, 8, 6], "k-discount": [16, 4, 8, 6], "g-fill": [0, 10, 8, 16], "p-status2": [8, 10, 8, 16], "b-category": [16, 10, 8, 16], "g-groups": [0, 26, 24, 22] },
      ["groups.city", "groups.category", "groups.status"]
    ),
    page(
      "page-delivery",
      "Delivery and claims",
      [
        text("t", "Fulfilment and delivery health"),
        kpi("k-shipped", "Shipments", "shipments.id", "count"),
        kpi("k-claimed", "Claimed amount", "claims.claimedUsd", "sum"),
        kpi("k-claims", "Damage claims", "claims.id", "count"),
        gauge("g-ontime", "On-time rate", "onTimeRate", "of delivered shipments"),
        gauge("g-delay", "Delay rate", "delayRate", "of all shipments"),
        pie("p-ship", "Delivery status", "shipments.status", "shipments.id", "count", "pie-chart"),
        bars("b-claims", "Claimed amount by status", "claims.status", "claims.claimedUsd", "sum"),
        grid("g-lanes", "Worst lanes", ["groups.city", "shipments.carrier", { id: "shipments.id", aggregation: "count" }, "onTimeRate", "delayRate"], "onTimeRate", "asc")
      ],
      { t: [0, 0, 24, 4], "k-shipped": [0, 4, 8, 6], "k-claimed": [8, 4, 8, 6], "k-claims": [16, 4, 8, 6], "g-ontime": [0, 10, 12, 16], "g-delay": [12, 10, 12, 16], "p-ship": [0, 26, 12, 16], "b-claims": [12, 26, 12, 16], "g-lanes": [0, 42, 24, 22] },
      ["shipments.status", "claims.status"]
    ),
    page(
      "page-members",
      "Members",
      [
        text("t", "Members and pledges"),
        kpi("k-members", "Member pledges", "members.id", "count"),
        kpi("k-member-units", "Units pledged by members", "members.units", "sum"),
        kpi("k-authorized", "Authorized by members", "members.authorizedUsd", "sum"),
        bars("b-member-cat", "Member units by group category", "groups.category", "members.units", "sum"),
        pie("p-member-status", "Pledges by status", "members.status", "members.id", "count"),
        grid("g-members", "Largest pledges", ["members.member", "groups.name", "members.units", "members.authorizedUsd", "members.status"], "members.units")
      ],
      { t: [0, 0, 24, 4], "k-members": [0, 4, 8, 6], "k-member-units": [8, 4, 8, 6], "k-authorized": [16, 4, 8, 6], "b-member-cat": [0, 10, 14, 16], "p-member-status": [14, 10, 10, 16], "g-members": [0, 26, 24, 22] },
      ["groups.city", "members.status"]
    )
  ]
};
