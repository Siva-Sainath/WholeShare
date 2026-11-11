import { registerOwnSession } from "./mosaicLive";
import { getCanvas } from "./canvasStore";
import { listWebMcpTools } from "./webmcp";
import type { McpToolDeclaration } from "./api";

export interface AgentStep {
  stepIndex?: number;
  toolName?: string;
  toolArgs?: Record<string, unknown>;
  toolResult?: Record<string, unknown> | null;
  interceptorStatus?: string;
  violations?: unknown;
}

export interface MosaicAction {
  label: string;
  ok: boolean;
  href?: string;
  tool?: string;
}

export interface MosaicBlock { permission: string; label: string; prompt: string; }

export interface MosaicReply {
  text: string;
  status: string;
  actions: MosaicAction[];
  blocked?: MosaicBlock;
}

export const ACTION_CATEGORIES = [
  "Navigate",
  "Discover",
  "Groups",
  "Ledger",
  "Logistics",
  "Disputes",
  "PayPal",
  "Settings",
  "Studio",
  "Bryntum",
  "Mosaic"
] as const;

export type ActionCategory = (typeof ACTION_CATEGORIES)[number];

export const ACTION_CATALOG: Record<string, { category: ActionCategory; label: string }> = {
  "ui.navigate": { category: "Navigate", label: "Go to a screen" },
  "onboarding.prefill": { category: "Navigate", label: "Fill in business details" },
  "onboarding.submit": { category: "Navigate", label: "Finish onboarding" },
  "radar.filter": { category: "Discover", label: "Filter buying groups" },
  "radar.search": { category: "Discover", label: "Find buying groups" },
  "radar.selectClan": { category: "Discover", label: "Open a buying group" },
  "radar.nextClan": { category: "Discover", label: "Next buying group" },
  "radar.prevClan": { category: "Discover", label: "Previous buying group" },
  "clan.pledge": { category: "Groups", label: "Pledge units" },
  "clan.inspect": { category: "Groups", label: "Inspect a group" },
  "clan.join": { category: "Groups", label: "Join a group" },
  "clan.viewRules": { category: "Groups", label: "Read a group's rules" },
  "leader.createClan": { category: "Groups", label: "Start a buying group" },
  "leader.audit": { category: "Groups", label: "Audit member commitments" },
  "leader.capture": { category: "Groups", label: "Prepare a batch capture" },
  "ledger.query": { category: "Ledger", label: "Search the ledger" },
  "ledger.sort": { category: "Ledger", label: "Sort the ledger" },
  "ledger.flash": { category: "Ledger", label: "Highlight a ledger value" },
  "ledger.export": { category: "Ledger", label: "Export the ledger" },
  "logistics.inspect": { category: "Logistics", label: "Inspect a shipment" },
  "logistics.track": { category: "Logistics", label: "Track a shipment" },
  "logistics.calendar": { category: "Logistics", label: "Show the delivery calendar" },
  "dispute.submit": { category: "Disputes", label: "File a damage claim" },
  "dispute.calculate": { category: "Disputes", label: "Estimate a claim refund" },
  "dispute.list": { category: "Disputes", label: "List damage claims" },
  "paypal.authorize": { category: "PayPal", label: "Prepare a PayPal authorization" },
  "paypal.invoice": { category: "PayPal", label: "Prepare a PayPal invoice" },
  "paypal.capture": { category: "PayPal", label: "Prepare a PayPal capture" },
  "paypal.status": { category: "PayPal", label: "Check PayPal status" },
  "settings.update": { category: "Settings", label: "Update settings" },
  "settings.get": { category: "Settings", label: "Read settings" },
  "studio.open": { category: "Studio", label: "Open the escrow Studio" },
  "bryntum.openTimeView": { category: "Bryntum", label: "Open the shipment timeline" },
  "mosaic.expand": { category: "Mosaic", label: "Expand Mosaic" },
  "mosaic.ask": { category: "Mosaic", label: "Ask Mosaic a question" }
};

export function describeTool(tool: McpToolDeclaration): { category: ActionCategory; label: string } {
  return ACTION_CATALOG[tool.name] ?? { category: "Mosaic", label: tool.name.replace(/[._]/g, " ") };
}

const VIEW_LABELS: Record<string, string> = {
  landing: "the home page",
  onboarding: "onboarding",
  radar: "Discover",
  discover: "Discover",
  ledger: "My Groups",
  "my-groups": "My Groups",
  leader: "My Groups",
  inventory: "My Groups",
  insights: "My Groups",
  logistics: "Disputes",
  disputes: "Disputes",
  subscriptions: "Settings",
  settings: "Settings",
  mosaic: "Mosaic",
  "mosaic-chat": "Mosaic deep work"
};

const GENERIC_TOOL_LABELS: Record<string, string> = {
  query_escrow_ledger: "Read the escrow ledger",
  ui_export_snapshot: "Exported a snapshot",
  discover_wholesale_catalog: "Searched the wholesale catalog",
  generate_step_up_invoice: "Prepared a step-up invoice",
  authorize_paypal_escrow: "Prepared a PayPal authorization",
  submit_damage_claim: "Filed a damage claim",
  get_clan_constitution: "Read a group's rules",
  explain_escrow_document: "Explained an escrow document"
};

function humanize(name: string): string {
  const words = name.replace(/^ui_/, "").replace(/[._]/g, " ").trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function isSuccess(step: AgentStep): boolean {
  const result = step.toolResult;
  if (step.interceptorStatus && step.interceptorStatus !== "PASSED") return false;
  if (!result) return false;
  if (typeof result.error === "string") return false;
  return result.status === undefined || result.status === "SUCCESS";
}

function failureReason(step: AgentStep): string {
  const result = step.toolResult;
  if (result && typeof result.error === "string") return result.error;
  if (step.interceptorStatus && step.interceptorStatus !== "PASSED") return "The request was blocked by a safety check.";
  return "The action did not complete.";
}

export function describeStep(step: AgentStep): MosaicAction {
  return { ...describeStepLabel(step), tool: step.toolName };
}

function describeStepLabel(step: AgentStep): MosaicAction {
  const name = step.toolName || "step";
  const args = step.toolArgs || {};
  const ok = isSuccess(step);
  if (!ok) return { label: `Could not ${humanize(name).toLowerCase()}. ${failureReason(step)}`, ok: false };
  if (name === "ui_navigate_view") {
    const view = String(args.view || "");
    return { label: `Opened ${VIEW_LABELS[view] || "a screen"}`, ok };
  }
  if (name === "ui_filter_clans") {
    const subject = String(args.query || args.search || args.category || "").trim();
    return { label: subject ? `Filtered to ${subject} groups` : "Cleared the group filter", ok };
  }
  if (name === "ui_open_slide_over") return { label: "Opened group details", ok };
  if (name.startsWith("schedule_")) return { label: String(step.toolResult?.summary ?? "Updated the delivery schedule"), ok };
  if (name === "ui_open_report") return { label: `Opened the ${String(step.toolResult?.page ?? "")} report`, ok };
  if (name === "present") return { label: `Showed ${String(step.toolResult?.artifact && (step.toolResult.artifact as { title?: string }).title || "the results")}`, ok };
  if (name === "kernel_research_web_fact") return { label: `Checked the web: ${String((step.toolResult?.data as { pageTitle?: string } | undefined)?.pageTitle || step.toolArgs?.targetUrl || "a page")}`, ok };
  if (name === "kernel_read_supplier_site") return { label: ok ? `Read ${String(step.toolResult?.pagesRead ?? 1)} supplier ${Number(step.toolResult?.pagesRead ?? 1) === 1 ? "page" : "pages"}` : "Could not read the supplier site", ok };
  if (name === "query") {
    const artifact = step.toolResult?.artifact as { title?: string } | undefined;
    return { label: artifact?.title ? `Showed ${artifact.title}` : `Read ${String(step.toolResult?.label ?? "the data")}${typeof step.toolResult?.matching === "number" ? ` (${step.toolResult.matching} rows)` : ""}`, ok };
  }
  if (name === "page_tool") {
    const used = String(step.toolArgs?.tool ?? "");
    const labels: Record<string, string> = { grid_filter: "Filtered the table", grid_sort: "Sorted the table", grid_group_by: "Grouped the table", grid_chart: "Charted the table", grid_clear_filters: "Cleared the table filters", grid_export_csv: "Exported the table", bryntum_show_view: "Switched the Bryntum view", bryntum_scheduler_zoom: "Zoomed the Scheduler" };
    return { label: ok ? labels[used] ?? `Used ${used.replace(/_/g, " ")}` : String(step.toolResult?.error ?? "The page could not do that"), ok };
  }
  if (name === "resolve") return { label: "Matched your words to the real items", ok };
  if (name === "compare_groups") return { label: `Compared ${Array.isArray(step.toolResult?.groups) ? step.toolResult.groups.length : "the"} groups`, ok };
  if (name === "join_group") return { label: ok ? `Prepared your pledge${step.toolResult?.group ? ` for ${String(step.toolResult.group)}` : ""}` : "Could not prepare the pledge", ok };
  if (name === "setup_profile") return { label: ok ? "Updated your profile" : "Could not update your profile", ok };
  if (name === "track_shipment") return { label: ok ? "Checked the shipment" : "Could not check the shipment", ok };
  if (name === "start_group_buy") {
    const missing = (step.toolResult?.missing as string[] | undefined) ?? [];
    return { label: `Opened the group buy form${missing.length ? `. Still needed: ${missing.join(", ")}` : ""}`, ok };
  }
  if (name === "find_suppliers") {
    const result = step.toolResult as { directoryMatches?: unknown[]; webLeads?: unknown[]; web?: { ok?: boolean } | null } | null;
    const directory = result?.directoryMatches?.length ?? 0;
    const leads = result?.webLeads?.length ?? 0;
    const web = result?.web ? (result.web.ok ? `, searched the web and saved ${leads} unverified ${leads === 1 ? "lead" : "leads"}` : ", the web search did not return a page") : "";
    return { label: `Found ${directory} suppliers in the directory${web}`, ok };
  }
  if (name === "ui_open_my_group") return { label: `Opened your dashboard for ${String(step.toolResult?.name ?? "the group")}`, ok };
  if (name === "ui_open_group") return { label: `Opened ${String(step.toolResult?.name ?? "the group")}`, ok };
  if (name === "file_damage_claim") {
    const claim = step.toolResult?.claim as { claimId?: string; claimedAmount?: number; damagedUnits?: number; photos?: number } | undefined;
    if (!claim?.claimId) return { label: "No claim was filed.", ok: false };
    const amount = typeof claim.claimedAmount === "number" ? ` for ${claim.claimedAmount.toLocaleString("en-US", { style: "currency", currency: "USD" })}` : "";
    return { label: `Filed draft claim ${claim.claimId}: ${claim.damagedUnits} units${amount}, ${claim.photos ?? 0} photo${claim.photos === 1 ? "" : "s"} attached. It is not sent to the supplier until you review it.`, ok };
  }
  if (name === "open_paypal_dashboard") {
    const label = typeof step.toolResult?.label === "string" ? step.toolResult.label : "PayPal page";
    return { label: `Prepared a link to the ${label}. Click it to open.`, ok, href: typeof step.toolResult?.url === "string" ? step.toolResult.url : undefined };
  }
  if (name === "prepare_pledge_quote") {
    const quote = step.toolResult?.quote as { units?: number; unitPriceCents?: number; amountCents?: number } | undefined;
    if (!quote || typeof quote.amountCents !== "number" || typeof quote.unitPriceCents !== "number") {
      return { label: "No pledge quote was returned, so nothing was prepared.", ok: false };
    }
    const usd = (cents: number) => (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
    return { label: `Prepared a pledge quote: ${quote.units} units at ${usd(quote.unitPriceCents)}, total ${usd(quote.amountCents)}. Nothing is authorized until you approve on PayPal.`, ok };
  }
  if (name === "query_escrow_ledger") {
    const rows = Array.isArray(step.toolResult?.coalitions) ? (step.toolResult?.coalitions as Array<{ totalEscrowCents?: number }>) : [];
    const cents = rows.reduce((sum, row) => sum + (row.totalEscrowCents || 0), 0);
    const total = (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
    return { label: `Read the ledger: ${rows.length} groups, ${total} committed (local ledger record, not verified against PayPal)`, ok };
  }
  return { label: GENERIC_TOOL_LABELS[name] || humanize(name), ok };
}

const appliedSteps = new Set<string>();

export async function applyStepOnce(sessionId: string, step: AgentStep): Promise<void> {
  const key = `${sessionId}:${step.stepIndex ?? 0}:${step.toolName ?? ""}`;
  if (appliedSteps.has(key)) return;
  appliedSteps.add(key);
  await dispatchUi(step);
}

async function dispatchUi(step: AgentStep): Promise<boolean> {
  const dispatch = window.wholeshareCmd?.dispatch;
  const result = step.toolResult;
  if (!dispatch || !result || !isSuccess(step)) return false;
  const action = typeof result.action === "string" ? result.action : "";
  const args = step.toolArgs || {};
  // The dispatcher ignores all-caps names as SSE confirmations, so use the dotted WebMCP names.
  if (action === "NAVIGATE_VIEW") return dispatch({ action: "ui.navigate", params: { view: args.view } });
  if (action === "FILTER_CLANS") {
    return dispatch({ action: "radar.filter", params: { query: args.query ?? args.search ?? args.category ?? "" } });
  }
  if (action === "OPEN_REPORT") return dispatch({ action: "insights.open", params: { page: result.page } });
  if (action === "SCHEDULE_CHANGED") return dispatch({ action: "ui.navigate", params: { view: "disputes" } });
  if (action === "PRESENT") return dispatch({ action: "canvas.present", params: { artifact: result.artifact } });
  if (step.toolName === "kernel_research_web_fact" && result.success === true) {
    const data = (result.data ?? {}) as { pageTitle?: string; currentUrl?: string; snippets?: unknown[] };
    const snippets = (Array.isArray(data.snippets) ? data.snippets : []).map((text) => String(text).replace(/\s+/g, " ").trim()).filter(Boolean).slice(0, 5).map((text) => text.slice(0, 320));
    return dispatch({ action: "canvas.present", params: { artifact: { kind: "research", title: data.pageTitle || "Web research", url: data.currentUrl || String(args.targetUrl ?? ""), query: String(args.query ?? ""), snippets, fetchedAt: new Date().toISOString() } } });
  }
  if (action === "START_GROUP_BUY") {
    (window as unknown as { __wholesharePrefill?: unknown }).__wholesharePrefill = result.fields;
    window.location.hash = "discover";
    window.setTimeout(() => window.dispatchEvent(new CustomEvent("ws:open-create-group", { detail: result.fields })), 400);
    return true;
  }
  if (action === "PROFILE_UPDATED") return /^#?mosaic-chat/.test(window.location.hash) ? true : dispatch({ action: "ui.navigate", params: { view: "settings" } });
  if (action === "OPEN_MY_GROUP") return dispatch({ action: "mygroup.open", params: { clanId: result.clanId } });
  if (action === "OPEN_GROUP") return dispatch({ action: "group.open", params: { clanId: result.clanId } });
  if (action === "CLAIM_FILED") return dispatch({ action: "ui.navigate", params: { view: "disputes" } });
  if (action === "PLEDGE_QUOTE") {
    const quote = result.quote as { clanId?: string; units?: number } | undefined;
    return quote?.clanId ? dispatch({ action: "clan.pledge", params: { clanId: quote.clanId, units: quote.units } }) : false;
  }
  if (action === "EXPORT_SNAPSHOT") return dispatch({ action: "export_snapshot", params: { format: args.format } });
  if (action === "OPEN_SLIDE_OVER" && typeof args.clanId === "string") {
    return dispatch({ action: "radar.selectClan", params: { clanId: args.clanId } });
  }
  return false;
}

const GENERIC_FINAL = /^session completed successfully\.?$/i;

declare global {
  interface Window {
    __wholeshareScreen?: Record<string, unknown>;
  }
}

function screenContext(): Record<string, unknown> {
  const hash = typeof window !== "undefined" ? window.location.hash.replace("#", "") : "";
  const open = getCanvas().artifact;
  const ids = open?.filter?.find((clause) => clause.field === "id" && Array.isArray(clause.value))?.value as string[] | undefined;
  const panel = open ? { panelOpen: { title: open.title, source: open.source, kind: open.kind, ...(ids ? { rowIds: ids } : {}) } } : {};
  // What this page lets the assistant do (grids on screen, the Scheduler, Studio reports). Names only, to keep the prompt short.
  const pageTools = listWebMcpTools().filter((tool) => /^(grid_|bryntum_|studio_)/.test(tool.name)).map((tool) => ({ name: tool.name, does: String(tool.description).slice(0, 90) }));
  return { view: hash || "landing", ...panel, ...(pageTools.length ? { pageTools } : {}), ...(window.__wholeshareScreen ?? {}) };
}

export async function allowMosaicPermission(permission: string): Promise<void> {
  const response = await fetch("/api/v1/user/settings", {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({ agentPermissions: { [permission]: true } })
  });
  if (!response.ok) throw new Error("Could not save that permission. Try again in Settings.");
}

export async function askMosaic(prompt: string, source: string, evidence: Array<Record<string, unknown>> = [], history: Array<{ role: "user" | "assistant"; text: string }> = []): Promise<MosaicReply> {
  const ownSessionId = `sess_${crypto.randomUUID()}`;
  registerOwnSession(ownSessionId);
  const response = await fetch("/api/v1/agent/chat", {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({ prompt, sessionId: ownSessionId, maxTurns: 6, metadata: { source, context: { ...screenContext(), evidenceAttached: evidence.length, evidence, history } } })
  });
  const raw = await response.text();
  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    throw new Error("WholeShare returned an unreadable response. Try again.");
  }
  if (!response.ok) {
    throw new Error(typeof payload.error === "string" ? payload.error : `Mosaic request failed (${response.status}).`);
  }
  const steps = Array.isArray(payload.steps) ? (payload.steps as AgentStep[]) : [];
  const actions: MosaicAction[] = [];
  const sessionId = typeof payload.sessionId === "string" ? payload.sessionId : "";
  let blocked: MosaicBlock | undefined;
  for (const step of steps) {
    if (!step.toolName) continue;
    const result = (step.toolResult ?? {}) as Record<string, unknown>;
    if (result.needsInput === true) continue;
    if (result.blocked === true && typeof result.permission === "string") {
      blocked = { permission: result.permission, label: String(result.permissionLabel ?? result.permission), prompt };
      actions.push({ label: `Needs permission to ${blocked.label}`, ok: false });
      continue;
    }
    actions.push(describeStep(step));
    await applyStepOnce(sessionId, step);
  }
  const final = typeof payload.finalMessage === "string" ? payload.finalMessage.trim() : "";
  // The server checks every figure in the model's reply against what the tools returned, so its words are shown as written.
  // The recorded actions only fill in when the model said nothing useful.
  const failed = actions.filter((action) => !action.ok).length;
  let text: string;
  if (blocked) {
    text = `I need your permission to ${blocked.label}. Allow it and I will continue.`;
  } else if (final && !GENERIC_FINAL.test(final)) {
    text = final;
  } else if (actions.length > 0) {
    const labels = actions.map((action) => action.label).filter(Boolean).join(". ");
    text = failed === 0 ? `${labels}.` : `Some steps did not complete (${failed} of ${actions.length}). ${labels}.`;
  } else {
    text = "I could not find an action for that request. Try asking about buying groups, the ledger, shipments or claims.";
  }
  return { text, status: typeof payload.status === "string" ? payload.status : "UNKNOWN", actions, blocked };
}
