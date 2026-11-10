// Mosaic Studio AI harness.
// Custom adapter that lets AG Studio built in agents talk to our local Mosaic model.
// Translation: Studio sends an AgLlmRequest (Responses API shape). This harness turns it
// into an OpenAI Chat Completions request, calls the local MLX Qwen server, then turns the
// Chat Completions response back into the AgLlmResponse shape Studio expects.
// The model is local only (Mosaic, MLX Qwen on this machine). No cloud model is ever called.
// If the local model is unreachable, the harness returns a clear error. It never fabricates
// a Studio response, a widget, or data.
//
// Why call MLX directly instead of the server /api/ai/responses proxy or the durable harness:
// the proxy drops tools, so Studio tool calls would never reach the model. The durable
// harness carries the app 56 WholeShare tools, not Studio tools. Only a direct call lets us
// pass Studio tools (translated to Chat Completions tools) to the model, so the built in
// agents can create widgets, apply filters, and query data. The MLX server allows any
// browser origin by default, so a direct call from the app works.

import { createAiHarness } from "ag-studio";

// Local model endpoint and model id. The model is the fine tuned Qwen served by MLX.
async function resolveModelUrl(): Promise<string> {
  try {
    const res = await fetch("/api/v1/config");
    if (res.ok) {
      const body = (await res.json()) as { mosaicChatCompletionsUrl?: string };
      if (body.mosaicChatCompletionsUrl) return body.mosaicChatCompletionsUrl;
    }
  } catch {
    // Reported below as an honest unreachable error.
  }
  throw new Error("Mosaic model URL is not configured on the server. Studio AI is unavailable.");
}
const DEFAULT_MODEL = "mlx-community/Qwen3.5-4B-MLX-4bit";

export const MOSAIC_STUDIO_MODEL = DEFAULT_MODEL;

export interface MosaicStudioAdapterConfig {
  mlxUrl?: string;
  model?: string;
  maxTokens?: number;
  temperature?: number;
}

// Minimal local types. They mirror the official definitions in
// node_modules/ag-studio/dist/types/api/ai/agLlmAdapter.d.ts, agAiMessage.d.ts,
// agAiTool.d.ts, and agAiProtocol.d.ts. Structural typing keeps this adapter
// assignable to the official AgLlmAdapter.

type AgAiInputContent = { type: "text"; text: string } | { type: "image"; detail: string; fileId?: string; imageUrl?: string } | { type: "file"; fileData?: string; fileId?: string; fileUrl?: string; filename?: string };
type AgAiOutputContent = { type: "text"; text: string; annotations: unknown[] } | { type: "refusal"; refusal: string };

interface AgAiConversationItem {
  id?: string;
  kind?: "input" | "output";
  type: string;
  role?: string;
  content?: AgAiInputContent[] | AgAiOutputContent[];
  callId?: string;
  name?: string;
  arguments?: string;
  output?: string;
  status?: string;
}

interface AgAiToolSchema {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  kind?: "client" | "server" | "provided";
  provider?: unknown;
}

interface AgLlmRequest {
  input: AgAiConversationItem[];
  instructions?: string;
  tools?: AgAiToolSchema[];
  toolChoice?: "auto" | "none" | "required" | { name: string };
  responseFormat: { type: "text" } | { type: "json"; name: string; description?: string; schema?: Record<string, unknown> };
  model?: { id: string; effort?: string };
}

interface AgLlmResponse {
  id: string;
  createdAt: number;
  error?: { code: string; message: string };
  incompleteDetails?: { reason?: "max_output_tokens" | "content_filter" };
  output: Record<string, unknown>[];
  status: "completed" | "failed" | "in_progress" | "cancelled" | "queued" | "incomplete";
  usage?: { inputTokens: number; outputTokens: number; totalTokens?: number };
  model?: string;
}

interface AgLlmResponseHandler {
  stream: { [Symbol.asyncIterator](): AsyncIterator<Record<string, unknown>> };
  complete: Promise<AgLlmResponse>;
}

interface AgLlmAdapter {
  executeTurn(request: AgLlmRequest, options?: { signal?: AbortSignal; trace?: unknown }): AgLlmResponseHandler;
}

// Chat Completions wire shapes.
interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_calls?: Array<{ id: string; type: "function"; function: { name: string; arguments: string } }>;
  tool_call_id?: string;
}

interface ChatTool {
  type: "function";
  function: { name: string; description: string; parameters: Record<string, unknown> };
}

function extractInputText(item: AgAiConversationItem): string {
  const parts = Array.isArray(item.content) ? item.content : [];
  const texts: string[] = [];
  for (const part of parts) {
    if (part.type === "text" && typeof (part as { text?: string }).text === "string") {
      texts.push((part as { text: string }).text);
    }
  }
  return texts.join("\n");
}

function extractOutputText(item: AgAiConversationItem): string {
  const parts = Array.isArray(item.content) ? item.content : [];
  const texts: string[] = [];
  for (const part of parts) {
    if (part.type === "text" && typeof (part as { text?: string }).text === "string") {
      texts.push((part as { text: string }).text);
    }
    if (part.type === "refusal" && typeof (part as { refusal?: string }).refusal === "string") {
      texts.push((part as { refusal: string }).refusal);
    }
  }
  return texts.join("\n");
}

function toChatMessages(request: AgLlmRequest): ChatMessage[] {
  const messages: ChatMessage[] = [];
  if (request.instructions) {
    messages.push({ role: "system", content: request.instructions });
  }
  for (const item of request.input) {
    if (item.type === "message" && item.kind === "input") {
      const text = extractInputText(item);
      if (text) messages.push({ role: item.role === "system" ? "system" : "user", content: text });
    } else if (item.type === "message" && item.kind === "output") {
      messages.push({ role: "assistant", content: extractOutputText(item) });
    } else if (item.type === "function_call") {
      messages.push({
        role: "assistant",
        content: null,
        tool_calls: [
          {
            id: item.callId || `call-${Date.now()}`,
            type: "function",
            function: { name: item.name || "", arguments: item.arguments || "{}" }
          }
        ]
      });
    } else if (item.type === "function_call_output") {
      messages.push({ role: "tool", tool_call_id: item.callId || "", content: item.output || "" });
    }
  }
  return messages;
}

function toChatTools(tools?: AgAiToolSchema[]): ChatTool[] | undefined {
  if (!tools || tools.length === 0) return undefined;
  const out: ChatTool[] = [];
  for (const tool of tools) {
    if (tool.kind === "provided") continue;
    out.push({
      type: "function",
      function: { name: tool.name, description: tool.description, parameters: tool.parameters }
    });
  }
  return out.length > 0 ? out : undefined;
}

function toChatToolChoice(toolChoice: AgLlmRequest["toolChoice"]): string | Record<string, unknown> | undefined {
  if (!toolChoice || toolChoice === "auto") return "auto";
  if (toolChoice === "none") return "none";
  if (toolChoice === "required") return "required";
  return { type: "function", function: { name: toolChoice.name } };
}

function toChatResponseFormat(responseFormat: AgLlmRequest["responseFormat"]): { type: string } | undefined {
  if (responseFormat.type === "json") return { type: "json_object" };
  return undefined;
}

function toStudioResponse(completion: Record<string, unknown>, model: string): AgLlmResponse {
  const choices = Array.isArray(completion.choices) ? completion.choices : [];
  const first = (choices[0] as Record<string, unknown>) || {};
  const msg = (first.message as Record<string, unknown>) || {};
  const output: Record<string, unknown>[] = [];
  const messageId = `msg-${Date.now()}`;
  const content = typeof msg.content === "string" ? msg.content : "";
  if (content.length > 0) {
    output.push({
      id: messageId,
      kind: "output",
      type: "message",
      role: "assistant",
      status: "completed",
      content: [{ type: "text", text: content, annotations: [] }]
    });
  }
  const toolCalls = Array.isArray(msg.tool_calls) ? msg.tool_calls : [];
  for (const tc of toolCalls) {
    const call = tc as Record<string, unknown>;
    const fn = (call.function as Record<string, unknown>) || {};
    const callId = typeof call.id === "string" ? call.id : `call-${Date.now()}`;
    output.push({
      id: `call-${callId}`,
      kind: "output",
      type: "function_call",
      callId,
      name: typeof fn.name === "string" ? fn.name : "",
      arguments: typeof fn.arguments === "string" ? fn.arguments : "{}",
      status: "completed"
    });
  }
  const usage = completion.usage as Record<string, unknown> | undefined;
  return {
    id: typeof completion.id === "string" ? completion.id : `resp-${Date.now()}`,
    createdAt: Date.now(),
    output,
    status: "completed",
    model,
    usage: usage
      ? {
          inputTokens: typeof usage.prompt_tokens === "number" ? usage.prompt_tokens : 0,
          outputTokens: typeof usage.completion_tokens === "number" ? usage.completion_tokens : 0,
          totalTokens: typeof usage.total_tokens === "number" ? usage.total_tokens : undefined
        }
      : undefined
  };
}

// Build the adapter. It translates each Studio turn into a Chat Completions call
// against the local MLX server, then translates the result back.
export function createMosaicStudioAdapter(config: MosaicStudioAdapterConfig = {}): AgLlmAdapter {
  const model = config.model || DEFAULT_MODEL;
  const maxTokens = config.maxTokens ?? 1024;
  const temperature = config.temperature ?? 0.2;

  return {
    executeTurn(request: AgLlmRequest, options?: { signal?: AbortSignal; trace?: unknown }): AgLlmResponseHandler {
      const completePromise: Promise<AgLlmResponse> = (async () => {
        const messages = toChatMessages(request);
        const tools = toChatTools(request.tools);
        const toolChoice = toChatToolChoice(request.toolChoice);
        const responseFormat = toChatResponseFormat(request.responseFormat);

        const mlxUrl = config.mlxUrl || (await resolveModelUrl());
        let res: Response;
        try {
          res = await fetch(mlxUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              model,
              messages,
              tools,
              tool_choice: toolChoice,
              response_format: responseFormat,
              max_tokens: maxTokens,
              temperature
            }),
            signal: options?.signal
          });
        } catch (err) {
          if (options?.signal?.aborted) throw err;
          throw new Error(`The Mosaic model could not be reached. Check the model settings on the server.`);
        }

        if (!res.ok) {
          const errText = await res.text().catch(() => "");
          throw new Error(`Mosaic request failed with status ${res.status}: ${errText}`);
        }

        const completion = (await res.json()) as Record<string, unknown>;
        return toStudioResponse(completion, model);
      })();

      return {
        stream: {
          async *[Symbol.asyncIterator]() {
            const finished = await completePromise;
            const messageId = `msg-${Date.now()}`;
            for (const item of finished.output) {
              if (item.type === "message") {
                const parts = Array.isArray(item.content) ? item.content : [];
                const text = parts
                  .filter((p) => (p as Record<string, unknown>).type === "text")
                  .map((p) => (p as { text?: string }).text || "")
                  .join("");
                if (text) {
                  yield { type: "TEXT_MESSAGE_CHUNK", messageId, role: "assistant", delta: text, timestamp: Date.now() };
                }
              } else if (item.type === "function_call") {
                yield {
                  type: "TOOL_CALL_CHUNK",
                  toolCallId: item.callId as string,
                  toolCallName: item.name as string,
                  delta: (item.arguments as string) || "{}",
                  timestamp: Date.now()
                };
              }
            }
          }
        },
        complete: completePromise
      };
    }
  };
}

// Build Studio default harness with the five built in agents (lead, data, page,
// planning, widget) running against the local Mosaic model. Use as the AgStudio
// `ai` prop: ai={(params) => buildMosaicStudioAi(params.api)}.
export function buildMosaicStudioAi(api: unknown): unknown {
  return createAiHarness(api as never, {
    adapter: createMosaicStudioAdapter() as never,
    primary: "lead",
    models: [{ id: "mosaic-local", label: "Mosaic (Local)" }],
    promptStarters: [
      { label: "Buying groups near MOQ", message: "Which buying groups are closest to their minimum order?" },
      { label: "Escrow totals by status", message: "Show escrow totals by status." },
      { label: "Members without orders", message: "Which members have no PayPal order yet?" }
    ]
  });
}
