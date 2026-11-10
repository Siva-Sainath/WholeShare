import { registerWebMcpTool } from "./webmcp";

// AG Studio ships its agent framework tools as plain values: api.getAiTools(). Each has a schema and an execute.
// Here the same tools are offered over WebMCP, so an outside agent builds and reads dashboards with Studio's own
// validated tools instead of guessing at the page. The tools run against the live dashboard the user has open.

interface StudioTool {
  name: string;
  description: string;
  schema(): { parameters?: Record<string, unknown> } | undefined;
  execute?(call: { toolCallId: string; name: string; args: Record<string, unknown> }, ctx: unknown): Promise<{ success: boolean; response?: string; data?: unknown; issues?: Array<{ message: string }> }>;
}

const READ_ONLY = new Set(["viewSchema", "viewReport", "viewPage", "viewWidget", "executeQuery"]);

const context = () => ({
  signal: new AbortController().signal,
  run: { threadId: "webmcp", runId: `run_${Date.now()}`, agentId: "webmcp" },
  success: (response: string, data?: unknown) => ({ success: true as const, response, data }),
  error: (messages: string | string[]) => ({ success: false as const, issues: (Array.isArray(messages) ? messages : [messages]).map((message) => ({ message })) })
});

export function registerStudioTools(api: { getAiTools: () => Record<string, (options?: unknown) => StudioTool> }): () => void {
  const toolkit = api.getAiTools();
  const release: Array<() => void> = [];
  for (const key of Object.keys(toolkit)) {
    // configureWidget needs a widget type bound up front, so it is not offered as a single generic tool.
    if (key === "configureWidget" || typeof toolkit[key] !== "function") continue;
    let tool: StudioTool;
    try {
      tool = toolkit[key]();
    } catch {
      continue;
    }
    const schema = tool.schema();
    if (!schema || !tool.execute) continue;
    release.push(registerWebMcpTool({
      name: `studio_${key.replace(/([A-Z])/g, "_$1").toLowerCase()}`,
      description: `AG Studio: ${tool.description}`,
      inputSchema: (schema.parameters as Record<string, unknown>) ?? { type: "object", properties: {} },
      readOnly: READ_ONLY.has(key),
      execute: async (args) => {
        const result = await tool.execute!({ toolCallId: `webmcp_${Date.now()}`, name: tool.name, args }, context());
        if (!result.success) throw new Error((result.issues ?? []).map((issue) => issue.message).join("; ") || "Studio rejected the call.");
        return { response: result.response, data: result.data };
      }
    }));
  }
  return () => release.forEach((fn) => fn());
}
