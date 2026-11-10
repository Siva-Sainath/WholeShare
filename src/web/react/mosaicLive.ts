import { applyStepOnce, describeStep } from "./mosaicAgent";
import { callWebMcpTool } from "./webmcp";
import type { AgentStep } from "./mosaicAgent";

export interface LiveItem {
  key: string;
  tool?: string;
  label: string;
  pending: boolean;
  ok: boolean;
  href?: string;
  detail?: string;
  startedAt?: number;
}

export interface LiveState {
  active: boolean;
  items: LiveItem[];
  draft?: string;
}

const MAX_ITEMS = 8;
let state: LiveState = { active: false, items: [] };
const listeners = new Set<() => void>();
const pendingArgs = new Map<string, Record<string, unknown>>();
let source: EventSource | null = null;
let clearTimer: number | undefined;

function emit(next: LiveState): void {
  state = next;
  listeners.forEach((listener) => listener());
}

export function subscribeLive(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getLiveState(): LiveState {
  return state;
}

const TOOL_PENDING_LABELS: Record<string, string> = {
  ui_navigate_view: "Opening a screen",
  ui_filter_clans: "Filtering buying groups",
  ui_open_slide_over: "Opening group details",
  query_escrow_ledger: "Reading the escrow ledger",
  prepare_pledge_quote: "Preparing a pledge quote",
  ui_export_snapshot: "Preparing an export",
  open_paypal_dashboard: "Preparing a PayPal link",
  file_damage_claim: "Filing a damage claim"
};

function parse(event: MessageEvent<string>): { payload: Record<string, unknown> } | null {
  try {
    const raw = JSON.parse(event.data) as { payload?: Record<string, unknown> };
    return raw.payload ? { payload: raw.payload } : null;
  } catch {
    return null;
  }
}

function onToolCall(event: MessageEvent<string>): void {
  const parsed = parse(event);
  if (!parsed) return;
  const { sessionId, stepIndex, toolName, args } = parsed.payload as { sessionId: string; stepIndex: number; toolName: string; args: Record<string, unknown> };
  const key = `${sessionId}:${stepIndex}:${toolName}`;
  pendingArgs.set(key, args || {});
  window.clearTimeout(clearTimer);
  const label = TOOL_PENDING_LABELS[toolName] ?? "Working";
  emit({ ...state, active: true, items: [...state.items.filter((item) => item.key !== key), { key, tool: toolName, label, pending: true, ok: true, startedAt: Date.now() }].slice(-MAX_ITEMS) });
}

async function onToolResult(event: MessageEvent<string>): Promise<void> {
  const parsed = parse(event);
  if (!parsed) return;
  const { sessionId, stepIndex, toolName, result } = parsed.payload as { sessionId: string; stepIndex: number; toolName: string; result: Record<string, unknown> };
  const key = `${sessionId}:${stepIndex}:${toolName}`;
  const step: AgentStep = { stepIndex, toolName, toolArgs: pendingArgs.get(key) ?? {}, toolResult: result ?? null, interceptorStatus: "PASSED" };
  pendingArgs.delete(key);
  if (result && (result as { needsInput?: boolean }).needsInput) {
    emit({ ...state, active: true, items: state.items.filter((item) => item.key !== key) });
    return;
  }
  const described = describeStep(step);
  emit({ ...state, active: true, items: state.items.map((item) => (item.key === key ? { ...item, tool: toolName, label: described.label, pending: false, ok: described.ok, href: described.href } : item)) });
  await applyStepOnce(sessionId, step);
}

function onSessionDone(): void {
  window.clearTimeout(clearTimer);
  emit({ ...state, active: false, draft: "" });
  clearTimer = window.setTimeout(() => emit({ active: false, items: [], draft: "" }), 6000);
}

export function startMosaicLive(): void {
  if (source || typeof EventSource === "undefined") return;
  source = new EventSource("/api/v1/events");
  source.addEventListener("AGENT_SESSION_STARTED", () => {
    window.clearTimeout(clearTimer);
    emit({ active: true, items: [], draft: "" });
  });
  // The model asked this page to run one of its tools (filter a grid, zoom the Scheduler, edit a Studio report).
  source.addEventListener("PAGE_TOOL_CALL", (event) => {
    const parsed = parse(event as MessageEvent<string>);
    if (!parsed) return;
    const { callId, tool, args } = parsed.payload as { callId: string; tool: string; args: Record<string, unknown> };
    void callWebMcpTool(tool, args ?? {})
      .then((result) => ({ callId, ok: true, result }))
      .catch((error: unknown) => ({ callId, ok: false, error: error instanceof Error ? error.message : "The page tool failed." }))
      .then((outcome) => fetch("/api/v1/agent/page-tool-result", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(outcome) }))
      .catch(() => undefined);
  });
  source.addEventListener("AGENT_TEXT_DELTA", (event) => {
    const parsed = parse(event as MessageEvent<string>);
    if (!parsed) return;
    const { text, reset } = parsed.payload as { text?: string; reset?: boolean };
    emit({ ...state, active: true, draft: reset ? "" : `${state.draft ?? ""}${text ?? ""}` });
  });
  source.addEventListener("AGENT_TOOL_PROGRESS", (event) => {
    const parsed = parse(event as MessageEvent<string>);
    if (!parsed) return;
    const { toolName, message } = parsed.payload as { toolName?: string; message?: string };
    emit({ ...state, items: state.items.map((item) => (item.pending && item.tool === toolName ? { ...item, detail: message } : item)) });
  });
  source.addEventListener("AGENT_TOOL_CALL", onToolCall as EventListener);
  source.addEventListener("AGENT_TOOL_RESULT", (event) => void onToolResult(event as MessageEvent<string>));
  source.addEventListener("AGENT_SESSION_COMPLETED", onSessionDone);
  source.addEventListener("AGENT_FAILURE", onSessionDone);
}
