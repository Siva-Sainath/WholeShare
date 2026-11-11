import { describeExternalTools, runExternalTool, durableHarness } from "./durable-harness.js";
import { actionDispatcher } from "./web-actions.js";
import { loadUserSettings } from "./user-settings.js";
import crypto from "node:crypto";

// A small MCP server (JSON-RPC 2.0 over HTTP) so an outside agent can use WholeShare for the person who invited it.
// The server decides who may call (an invite token) and what they may do (the permission switches in Settings).
const SUPPORTED = ["2025-06-18", "2025-03-26", "2024-11-05"];
const SERVER_INFO = { name: "wholeshare", title: "WholeShare", version: "1.0.0" };
const INSTRUCTIONS = [
  "WholeShare is a B2B group buying marketplace that runs in the PayPal sandbox.",
  "Use query, resolve and compare_groups to find and compare buying groups, then join_group to prepare a pledge.",
  "A pledge is never charged by this connection. It returns a PayPal approval that the person gives on PayPal.",
  "Some tools are blocked until the person allows them in Settings. A blocked result names the switch.",
  "ask_mosaic hands a whole request to the person's own assistant, which uses the same tools and rules."
].join(" ");

const ASK_MOSAIC = {
  name: "ask_mosaic",
  description: "Give the person's assistant a whole request in plain words, for example 'Find the cheaper New York container group and prepare a pledge for 12 cases'. It plans, uses the tools and returns what it did.",
  inputSchema: { type: "object", properties: { request: { type: "string", description: "What the person wants done, in plain words." } }, required: ["request"], additionalProperties: false },
  annotations: { title: "Ask Mosaic", readOnlyHint: false, destructiveHint: false, openWorldHint: true }
};

const TITLES = (name) => name.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());

export function listMcpTools() {
  const tools = describeExternalTools().map((tool) => ({
    name: tool.name,
    title: TITLES(tool.name),
    description: tool.description + (tool.permissionLabel ? ` Needs the Settings switch to ${tool.permissionLabel}.` : ""),
    inputSchema: tool.parameters && tool.parameters.type === "object" ? tool.parameters : { type: "object", properties: {} },
    annotations: { title: TITLES(tool.name), readOnlyHint: tool.effect === "read", destructiveHint: false, openWorldHint: tool.name.startsWith("kernel_") || tool.name === "track_shipment" }
  }));
  return [...tools, ASK_MOSAIC];
}

const rpcError = (id, code, message) => ({ jsonrpc: "2.0", id: id ?? null, error: { code, message } });
const rpcResult = (id, result) => ({ jsonrpc: "2.0", id, result });
const text = (value, isError = false) => ({ content: [{ type: "text", text: typeof value === "string" ? value : JSON.stringify(value) }], isError });

// Returns the JSON-RPC response, or null for a notification (the caller answers 202).
export async function handleMcpMessage(message, { label = "agent" } = {}) {
  if (!message || typeof message !== "object" || message.jsonrpc !== "2.0" || typeof message.method !== "string") return rpcError(message?.id, -32600, "Invalid request.");
  const { id, method, params } = message;
  const isNotification = id === undefined || id === null;
  if (isNotification) return null;

  if (method === "initialize") {
    const asked = params?.protocolVersion;
    return rpcResult(id, { protocolVersion: SUPPORTED.includes(asked) ? asked : SUPPORTED[0], capabilities: { tools: { listChanged: false } }, serverInfo: SERVER_INFO, instructions: INSTRUCTIONS });
  }
  if (method === "ping") return rpcResult(id, {});
  if (!loadUserSettings().agentPermissions?.externalAgentAccessEnabled) {
    return rpcError(id, -32001, "Outside agent access is switched off. The person can turn it on in Settings, Agent and AI.");
  }
  if (method === "tools/list") return rpcResult(id, { tools: listMcpTools() });
  if (method === "tools/call") {
    const name = String(params?.name ?? "");
    const args = params?.arguments ?? {};
    const sessionId = `mcp_${crypto.randomUUID()}`;
    actionDispatcher.broadcast("EXTERNAL_AGENT_CALL", { sessionId, agent: label, tool: name, at: new Date().toISOString() });
    try {
      if (name === "ask_mosaic") {
        const request = String(args.request ?? "").trim().slice(0, 2000);
        if (!request) return rpcResult(id, text({ error: "Say what the person wants done." }, true));
        const result = await durableHarness.startSession({ prompt: request, sessionId: `sess_${crypto.randomUUID()}`, maxTurns: 6, metadata: { source: "mosaic-deep-work", context: { via: "mcp", agent: label } } });
        const steps = (result.steps ?? []).map((step) => ({ tool: step.toolName, ok: !step.toolResult?.error && !step.toolResult?.blocked, blocked: step.toolResult?.blocked ? step.toolResult.permissionLabel : undefined }));
        return rpcResult(id, text({ answer: result.finalMessage, steps }));
      }
      const outcome = await runExternalTool(name, args);
      return rpcResult(id, text(outcome, Boolean(outcome?.error || outcome?.blocked)));
    } catch (error) {
      return rpcResult(id, text({ error: String(error?.message ?? "The tool failed.").slice(0, 300) }, true));
    }
  }
  return rpcError(id, -32601, `Method not found: ${method}`);
}
