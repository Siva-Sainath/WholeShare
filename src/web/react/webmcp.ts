// WebMCP for WholeShare. Tools are declared on document.modelContext so any agent that visits the page
// (a browser agent, ChatGPT Desktop, the WebMCP extension) can see what it may do and act in the user's own session.
// Where the browser has no native modelContext, a small compatible object is installed so the same tools can be
// listed and called by the WebMCP extension, by tests, and by our own Mosaic panel.
// Nothing here moves money. Pledges, captures and payouts stay behind PayPal approval.

export interface WebMcpTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  /** Marks tools that only read. Agents may call these freely. */
  readOnly?: boolean;
  execute: (args: Record<string, unknown>) => Promise<unknown> | unknown;
}

interface NativeContext {
  registerTool?: (tool: unknown) => unknown;
  unregisterTool?: (name: string) => void;
}

const registry = new Map<string, WebMcpTool>();
const listeners = new Set<() => void>();
let nativeSeen = false;

function nativeContext(): NativeContext | null {
  const doc = document as unknown as { modelContext?: NativeContext };
  const nav = navigator as unknown as { modelContext?: NativeContext };
  return doc.modelContext ?? nav.modelContext ?? null;
}

function emit(): void {
  listeners.forEach((listener) => listener());
}

export function subscribeWebMcp(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function asContent(value: unknown): { content: Array<{ type: "text"; text: string }> } {
  return { content: [{ type: "text", text: typeof value === "string" ? value : JSON.stringify(value) }] };
}

export function registerWebMcpTool(tool: WebMcpTool): () => void {
  registry.set(tool.name, tool);
  const native = nativeContext();
  if (native?.registerTool && !(native as { __wholeshare?: boolean }).__wholeshare) {
    nativeSeen = true;
    try {
      native.registerTool({
        name: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema,
        annotations: { readOnlyHint: Boolean(tool.readOnly) },
        execute: async (args: Record<string, unknown>) => asContent(await tool.execute(args ?? {}))
      });
    } catch {
      // A browser that rejects a tool keeps the rest of the page working. The registry below still serves it.
    }
  }
  emit();
  return () => {
    if (registry.get(tool.name) === tool) registry.delete(tool.name);
    try { nativeContext()?.unregisterTool?.(tool.name); } catch { /* already gone */ }
    emit();
  };
}

export function listWebMcpTools(): Array<Pick<WebMcpTool, "name" | "description" | "inputSchema" | "readOnly">> {
  return [...registry.values()].map(({ name, description, inputSchema, readOnly }) => ({ name, description, inputSchema, readOnly }));
}

export async function callWebMcpTool(name: string, args: Record<string, unknown> = {}): Promise<unknown> {
  const tool = registry.get(name);
  if (!tool) throw new Error(`No WebMCP tool named '${name}'. Call listTools first.`);
  return tool.execute(args);
}

export function webMcpStatus(): { native: boolean; tools: number } {
  return { native: nativeSeen, tools: registry.size };
}

// When the browser has no modelContext, expose a compatible one. Marked so we never mistake it for the native API.
function installFallbackContext(): void {
  if (nativeContext()) return;
  const fallback = {
    __wholeshare: true,
    registerTool: () => undefined,
    unregisterTool: () => undefined,
    listTools: () => listWebMcpTools(),
    callTool: async (name: string, args?: Record<string, unknown>) => asContent(await callWebMcpTool(name, args ?? {}))
  };
  try {
    Object.defineProperty(document, "modelContext", { value: fallback, configurable: true });
  } catch {
    (window as unknown as { __webmcp?: unknown }).__webmcp = fallback;
  }
}

const obj = (properties: Record<string, unknown>, required: string[] = []) => ({ type: "object", properties, required });

async function getJson(path: string): Promise<unknown> {
  const response = await fetch(path, { headers: { accept: "application/json" } });
  const payload = await response.json();
  if (!response.ok) throw new Error((payload as { error?: string }).error ?? `Request failed (${response.status}).`);
  return payload;
}

async function postJson(path: string, body: unknown): Promise<unknown> {
  const response = await fetch(path, { method: "POST", headers: { "content-type": "application/json", accept: "application/json" }, body: JSON.stringify(body) });
  const payload = await response.json();
  if (!response.ok) throw new Error((payload as { error?: string }).error ?? `Request failed (${response.status}).`);
  return payload;
}

function dispatch(action: string, params: Record<string, unknown>): Promise<boolean> | boolean {
  const dispatcher = (window as unknown as { wholeshareCmd?: { dispatch: (input: { action: string; params: Record<string, unknown> }) => Promise<boolean> | boolean } }).wholeshareCmd?.dispatch;
  if (!dispatcher) throw new Error("The app is still loading. Try again in a moment.");
  return dispatcher({ action, params });
}

const VIEWS = ["discover", "my-groups", "disputes", "insights", "agents", "settings", "mosaic-chat", "paypal"];

const APP_TOOLS: WebMcpTool[] = [
  {
    name: "wholeshare_describe",
    description: "Describe WholeShare: its screens, data sources, and what an agent may do. Call this first.",
    inputSchema: obj({}),
    readOnly: true,
    execute: async () => {
      const harness = (await getJson("/api/v1/harness")) as { summary: string; dataSources: unknown[]; snapshots: unknown[]; guardrails: string[] };
      return { summary: harness.summary, screens: VIEWS, dataSources: harness.dataSources, snapshots: harness.snapshots, guardrails: harness.guardrails, grids: "Call grid_list to see the AG Grid tables currently on screen.", studio: "Open the insights screen to unlock the studio_ tools." };
    }
  },
  {
    name: "wholeshare_navigate",
    description: "Open a screen of the app.",
    inputSchema: obj({ view: { type: "string", enum: VIEWS } }, ["view"]),
    execute: async (args) => ({ ok: await dispatch("ui.navigate", { view: args.view }) })
  },
  {
    name: "wholeshare_query_data",
    description: "Read rows from a data source: groups, members, ledger, claims, shipments, suppliers, paypal_invoices. Filter operators: eq, ne, contains, in, gt, gte, lt, lte.",
    inputSchema: obj({
      source: { type: "string" },
      filter: { type: "array", items: obj({ field: { type: "string" }, op: { type: "string" }, value: {} }, ["field", "value"]) },
      sort: obj({ field: { type: "string" }, direction: { type: "string", enum: ["asc", "desc"] } }),
      limit: { type: "number" }
    }, ["source"]),
    readOnly: true,
    execute: async (args) => {
      const query = new URLSearchParams({ limit: String(Math.min(Number(args.limit) || 20, 100)) });
      if (args.filter) query.set("filter", JSON.stringify(args.filter));
      if (args.sort) query.set("sort", JSON.stringify(args.sort));
      return getJson(`/api/v1/data/${encodeURIComponent(String(args.source))}?${query}`);
    }
  },
  {
    name: "wholeshare_show_data",
    description: "Put a data source in the side panel as an AG Grid the user can sort, filter, group and chart. Use this so the user sees the rows.",
    inputSchema: obj({ source: { type: "string" }, title: { type: "string" }, filter: { type: "array", items: { type: "object" } } }, ["source", "title"]),
    execute: async (args) => ({ ok: await dispatch("canvas.present", { artifact: { kind: "grid", source: args.source, title: args.title, filter: args.filter, limit: 100 } }) })
  },
  {
    name: "wholeshare_open_report",
    description: "Open a live AG Studio report page: paypal, demand, delivery or members.",
    inputSchema: obj({ page: { type: "string", enum: ["paypal", "demand", "delivery", "members"] } }, ["page"]),
    execute: async (args) => ({ ok: await dispatch("insights.open", { page: args.page }) })
  },
  {
    name: "wholeshare_open_group",
    description: "Open a buying group page by its id.",
    inputSchema: obj({ clanId: { type: "string" } }, ["clanId"]),
    execute: async (args) => ({ ok: await dispatch("group.open", { clanId: args.clanId }) })
  },
  {
    name: "wholeshare_find_suppliers",
    description: "Find suppliers for a product. Searches the directory, and with webSearch true also opens a live Kernel cloud browser and saves unverified web leads.",
    inputSchema: obj({ product: { type: "string" }, country: { type: "string" }, webSearch: { type: "boolean" } }, ["product"]),
    execute: async (args) => postJson("/api/v1/suppliers/find", args)
  },
  {
    name: "wholeshare_start_group_buy",
    description: "Open the Start a group buy form already filled in for the user to review. It never publishes.",
    inputSchema: obj({ product: { type: "string" }, city: { type: "string" }, targetUnits: { type: "number" }, basePriceUsd: { type: "number" }, supplierMode: { type: "string", enum: ["VOTE", "URL", "KERNEL"] }, vendorUrl: { type: "string" } }, ["product"]),
    execute: async (args) => {
      (window as unknown as { __wholesharePrefill?: unknown }).__wholesharePrefill = { ...args, name: `${args.city ? `${args.city} ` : ""}${args.product} buyers`.slice(0, 80) };
      window.location.hash = "discover";
      window.setTimeout(() => window.dispatchEvent(new CustomEvent("ws:open-create-group", { detail: (window as unknown as { __wholesharePrefill?: unknown }).__wholesharePrefill })), 400);
      return { ok: true, note: "The form is open for the user to review. Nothing was published." };
    }
  },
  {
    name: "wholeshare_snapshot",
    description: "Freeze a view as a shareable snapshot. Returns links to JSON, CSV and a styled HTML page the agent can hand to its own user.",
    inputSchema: obj({ component: { type: "string", enum: ["groups", "suppliers", "claims", "claims-board", "shipments", "schedule", "ledger", "invoices", "members"] } }, ["component"]),
    readOnly: true,
    execute: async (args) => {
      const base = `${window.location.origin}/api/v1/snapshot/${encodeURIComponent(String(args.component))}`;
      const snapshot = (await getJson(base)) as { title: string; summary: unknown };
      return { title: snapshot.title, summary: snapshot.summary, links: { json: base, csv: `${base}?format=csv`, html: `${base}?format=html` } };
    }
  }
];

let installed = false;
export function installWebMcp(): void {
  if (installed) return;
  installed = true;
  installFallbackContext();
  APP_TOOLS.forEach(registerWebMcpTool);
  (window as unknown as { __webmcpCall?: typeof callWebMcpTool; __webmcpList?: typeof listWebMcpTools }).__webmcpCall = callWebMcpTool;
  (window as unknown as { __webmcpList?: typeof listWebMcpTools }).__webmcpList = listWebMcpTools;
}
