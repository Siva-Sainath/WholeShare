# WholeShare harness study (10 Nov 2026)

Scope: compare the Mosaic harness with well regarded agent harnesses, WebMCP implementations, and latency techniques, then rank changes. Every external claim has a URL. "Unverified" means I found it only in a secondary source, could not open the primary source, or could not confirm it for our exact model.

Method note. Pages were fetched through a summarizing fetch tool, so quotes are paraphrases of the pages. Where two sources disagreed I say so. The repo changed while I was reading it (text streaming, parallel read prefetch and tool deadlines landed in `durable-harness.js` and `model-client.js` mid-study). The "ours" column below reflects the later state, and I mark items that were already added.

## 1. What our harness is today

Read: `src/lib/durable-harness.js`, `tool-registry.js` (focused subset), `mosaic-tools.js`, `model-client.js`, `src/web/react/mosaicAgent.ts`, `webmcp.ts`, `gridWebMcp.ts`, `studioWebMcp.ts`, `docs/HARNESS.md`, `docs/MOSAIC_GENERALIZATION_PLAN.md`.

- Loop: custom `runExecutionLoop`, up to 4 model calls per turn from the client (`maxTurns: 4`), non-parallel by design except a new prefetch of `PARALLEL_SAFE` reads (`query`, `resolve`, `compare_groups`, `query_escrow_ledger`) when one response has more than one call.
- Prompt: one system message of about 40 lines, then up to 6 prior turns (400 chars each), then the user prompt. A JSON blob of the current screen and profile sits in the middle of the system message, before the policy text.
- Tools: 25 focused OpenAI-style function schemas, fixed list, `tool_choice: auto` (or `none` to force a text answer).
- Guards: Laya risk gate, interceptor, `PERMISSION_FOR_TOOL` allow flags set by the user, step-up for escrow, `kernelBudget` (max 2 browser reads), per-tool deadlines (30 to 60 s) that return an error object as the result.
- Reply check: `reply-check.js` compares numbers and names in the draft with tool results. On a mismatch it adds a user message and makes another model call with `tool_choice: none`.
- Durability: every step is saved with `saveAgentStep` (awaited) and sessions can be resumed.
- Streaming: model text deltas are now streamed server side (`_executeStream`) and broadcast as `AGENT_TEXT_DELTA`; `mosaicLive.ts` listens for them. Tool arguments are assembled but not acted on until the whole response ends.
- Client: `askMosaic` in `mosaicAgent.ts` does one `POST /api/v1/agent/chat`, waits for the entire JSON, then loops over `steps` and calls `applyStepOnce`. So screen actions (navigate, filter, open group, present) happen only after the full turn, even though the events were broadcast earlier.
- Model: Fireworks `minimax-m3p1-flash`, `MOSAIC_EXTRA_BODY={"reasoning_effort":"none"}` in `.env`.
- Measured: median 8.7 s, p90 21 s, 3 to 8 sequential model calls. By simple division that is roughly 2 to 3 s per model call plus tool time (my inference, not a measurement).

## 2. Findings by harness

### Claude Code and Claude Agent SDK
- Core loop is a single threaded loop: call model, run tools, return results, repeat. This comes from secondary reverse engineering write ups, so treat details as unverified: https://blog.promptlayer.com/claude-code-behind-the-scenes-of-the-master-agent-loop/
- Parallelism for large work comes from subagents with separate contexts (secondary source, "up to 10 concurrent" unverified): https://aicrossroads.substack.com/p/claude-code-subagents
- Streaming: the SDK exposes raw API events with `includePartialMessages`; tool input arrives as `input_json_delta` and a `content_block_stop` marks a complete call. A cut stream can leave a tool block open, so treat that input as incomplete. Subagent token deltas are not forwarded. https://code.claude.com/docs/en/agent-sdk/streaming-output
- Permissions are a first class SDK concept (separate page linked from the streaming doc): https://code.claude.com/docs/en/agent-sdk/permissions.md
- Anthropic notes Claude often emits a short text block before the `tool_use` block, which doubles as progress narration: https://platform.claude.com/docs/en/agents-and-tools/tool-use/define-tools

### Anthropic guidance (building effective agents, context engineering, advanced tool use)
- Routing (cheap model for easy inputs), parallelization (sectioning), prompt chaining, and "find the simplest solution possible". Agentic systems trade latency and cost for quality. Frameworks can hide prompts. https://www.anthropic.com/engineering/building-effective-agents
- Tool design is "prompt engineering": junior developer style descriptions, poka-yoke arguments. Same page.
- Tool result clearing is called one of the safest light compaction forms. Tools should return token efficient results. Just in time retrieval via lightweight references. https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents
- Define tools doc: consolidate related operations into fewer tools, return only high signal fields with stable identifiers, namespace tool names. https://platform.claude.com/docs/en/agents-and-tools/tool-use/define-tools
- Advanced tool use numbers: tool search cut a 58 tool MCP setup from about 77K to 8.7K tokens (85 percent less) and raised accuracy (Opus 4 from 49 to 74 percent, Opus 4.5 from 79.5 to 88.1 percent). Programmatic tool calling cut tokens 37 percent (43,588 to 27,297) and removes 19+ inference passes in a 20 tool workflow, with no end to end time figure published. Tool use examples raised complex parameter accuracy from 72 to 90 percent at about 20 to 200 tokens each. https://www.anthropic.com/engineering/advanced-tool-use
- Programmatic tool calling and tool search are Anthropic API features, not available on Fireworks MiniMax. They matter here only as ideas (one model call that fans out to many tool calls). Programmatic tool calling is not eligible for zero data retention: https://platform.claude.com/docs/en/agents-and-tools/tool-use/programmatic-tool-calling
- Parallel tool use: the API does not prescribe how to execute multiple calls. Independent read only calls are usually safe concurrently; side effect calls may be better sequential. Return one `tool_result` per call, all in a single next user message. Prompting for parallelism helps ("invoke all relevant tools simultaneously"). Wrong history formatting teaches the model to stop calling in parallel (Troubleshooting section). https://platform.claude.com/docs/en/agents-and-tools/tool-use/parallel-tool-use
- Fine grained tool streaming (`eager_input_streaming`) sends tool input without server side JSON buffering; partial or invalid JSON must be guarded. https://platform.claude.com/docs/en/agents-and-tools/tool-use/fine-grained-tool-streaming
- Prompt caching order is tools, then system, then messages. A change at one level invalidates it and everything after. Reads cost 0.1x (0.05x for Sonnet 5.5). Tool definition changes invalidate all levels; `tool_choice` changes invalidate message blocks. https://platform.claude.com/docs/en/build-with-claude/prompt-caching

### OpenAI Agents SDK and Responses API
- Tool timeouts: `@function_tool(timeout=...)`; default `timeout_behavior="error_as_result"` returns the timeout message to the model so it can recover. This is the pattern our `withDeadline` copies. https://openai.github.io/openai-agents-python/tools/
- Human approval: `needs_approval` pauses the run and returns `interruptions` to resume from state. Same page.
- Tool guardrails exist for input and output; `is_enabled` is not authorization. Same page.
- Deferred loading and a `ToolSearchTool` exist for Responses models only; namespaces of under about 10 functions recommended. Same page.
- Parallel tool execution and `stop_on_first_tool` were not on that page. I could not confirm them, so I do not rely on them (unverified).
- Responses API streams `response.function_call_arguments.delta` and `.done` events keyed by `item_id` and `output_index`; the final args arrive on `.done`. Event spelling varies between sources. https://community.openai.com/t/responses-api-streaming-the-simple-guide-to-events/1363122
- OpenAI latency guide (most useful for us): output tokens are usually the slowest step, "cutting 50% of your output tokens may cut ~50% of your latency"; cutting prompt length 50 percent may improve latency only 1 to 5 percent; combine sequential steps to make fewer requests; parallelize; use speculative execution (start the likely next step early, cancel if wrong); streaming is the most effective way to cut perceived wait; do not default to an LLM. https://developers.openai.com/api/docs/guides/latency-optimization

### Vercel AI SDK
- Stream protocol has tool input start, delta and end parts, and a final tool call part when the input is complete and ready to execute. https://ai-sdk.dev/v5/docs/ai-sdk-ui/stream-protocol
- Loop control: `stopWhen`, `prepareStep` and `activeTools` change tools or model per step. Keep the active set small. Source is a search summary and third party guides; the official page fetch failed: https://ai-sdk.dev/v6/docs/agents/loop-control (unverified details). Version names changed in v7 (`onStepFinish` to `onStepEnd`) per the same search.
- Whether the SDK runs several tool calls of one step concurrently: I could not confirm from docs (unverified).
- Our own `AGENTS.md` says tool loops should use the Vercel AI SDK `streamText`/`generateText`, and the Mosaic harness is a hand written loop. That is a standing conflict with our own rule. My view: do not migrate now (see section 6, item "not recommended"). Borrow the event model instead, and either update `AGENTS.md` or accept the exception in writing.

### LangGraph
- Runtime for long running stateful agents with durable execution and human in the loop interrupts: https://docs.langchain.com/oss/python/langgraph/overview
- Several stream modes (values, updates, messages, custom, and others) that can be combined: https://docs.langchain.com/oss/python/langgraph/streaming
- Interrupts and parallel tool calls conflict: the official tutorial disables parallel tool calling when interrupting during tool execution, to avoid repeated invocations on resume. https://docs.langchain.com/oss/python/langgraph/add-human-in-the-loop . Third party reports of double execution bugs are unverified: https://hn.jakechampion.name/reader/https://blog.raed.dev/posts/langgraph-hitl
- Relevance: our `AWAITING_STEP_UP` suspend/resume is the same idea. It is hand rolled, with no checkpoint library, and resume rebuilds history from steps with a different system prompt (`buildInitialMessages`, not the focused prompt).

### browser-use and OpenHands
- browser-use agent settings: `max_actions_per_step` (default 10), `use_vision`, `flash_mode` ("faster execution mode with reduced prompting"), `use_thinking`. No benchmark numbers found. Secondary source: https://tessl.io/registry/tessl/pypi-browser-use/0.7.0/files/docs/agent-orchestration.md . Multiple actions per model step is the same lever as parallel tool calls: fewer model round trips.
- Survey of browser agent architecture and security: https://arxiv.org/html/2511.19477 (not read in depth).
- OpenHands: append only event stream as source of truth, agent as a pure function from history to next action, condenser (LLM summarizing) for long history, keyword triggered microagents. Newer SDK docs: https://docs.openhands.dev/sdk/arch/events . The "up to 2x cost" condenser claim is from a secondary summary (unverified). Relevance is low for a 4 turn chat agent.

### LLMCompiler (research reference for parallel calls)
- Up to 3.7x latency speedup vs ReAct, up to 1.35x vs OpenAI parallel function calling, upper bounds across benchmarks, typical figures lower (1.4x to 1.8x on HotpotQA in secondary summaries). https://arxiv.org/abs/2312.04511

## 3. WebMCP and in-page agents

- Spec shape: `registerTool({name, description, inputSchema, execute})` with `AbortSignal` for unregistering and an `exposedTo` origin list; `getTools()`, `executeTool()`, and a `toolchange` event. Tool definitions are loaded into model context, so changing them means unregister and re-register. Consent and elicitation are an open question (delegate to the harness or a native dialog). Tool code must re-validate at execution time. Permissions Policy gates it (`allow="tools"` for cross origin iframes). https://github.com/webmachinelearning/webmcp
- The README fetch showed `document.modelContext`. Secondary sources say the surface moved from `navigator.modelContext` (Chrome 146 to 149) to `document.modelContext`, with a public origin trial in Chrome 149 (announced 19 May 2026). All of that is secondary and unverified: https://patrickbrosset.com/articles/2026-02-23-webmcp-updates-clarifications-and-next-steps/ , https://mcpplaygroundonline.com/blog/what-is-webmcp . Our `nativeContext()` checks both names, which is the right hedge.
- Chrome's early preview page confirms WebMCP exists, with a declarative form based API and an imperative JavaScript API, prototype only for early preview participants. It does not describe the methods: https://developer.chrome.com/blog/webmcp-epp . I found no source confirming a `requestUserInteraction` method (unverified, likely not in the spec).
- Annotations: the spec page I read did not mention `readOnlyHint`. Our `webmcp.ts` sends `annotations: { readOnlyHint }` to native `registerTool`. Native browsers may ignore or reject unknown fields; our try/catch handles rejection. Treat as unverified.
- MCP-B: community polyfill for `document.modelContext` plus a bridge to MCP clients and a Chrome extension (`@mcp-b/webmcp-polyfill`, `@mcp-b/global`). https://github.com/WebMCP-org/npm-packages . Authorship claims are unverified.
- AG Grid and AG Studio post: it only says WebMCP lets a page declare tools, mentions built in tools plus "tool libraries", that Studio tools can run in Studio's harness, a third party harness, or WebMCP, that Chrome ships it only behind a dev flag, that calls run in the user's browser context and the user's tokens pay for the agent. It does not give the tool list, lifecycle, permissions, streaming or UI treatment. https://www.ag-grid.com/blog/webmcp-in-ag-studio-dashboards/ . Our `docs/HARNESS.md` says our design is "as described in" that post; the register on mount, unregister on unmount lifecycle is our own design, not something the post specifies. Reword that sentence.
- NLWeb: `/ask` REST endpoint returning Schema.org JSON, plus an MCP endpoint exposing `ask`; it is site level natural language search, a different layer than in page tools. Secondary sources only: https://cdn.jsdelivr.net/gh/nlweb-ai/nlweb@main/README.md
- CopilotKit and AG-UI: tools can be defined in the frontend and sent to the agent; AG-UI has `TOOL_CALL_START` style events with a call id and name; human approval via `renderAndWaitForResponse` (v1, deprecated) and reportedly `useHumanInTheLoop` (v2, unverified). https://docs.ag-ui.com/concepts/tools , https://docs.copilotkit.ai/reference/hooks/useDefaultTool
- assistant-ui: tool UIs receive `args` (partial while streaming), `result`, and `status`; a `requires-action` status drives approval UIs. The data stream runtime does not support human in the loop interrupts per its docs. Mostly third party summaries, API in flux: https://www.assistant-ui.com/docs/guides/tools , https://www.assistant-ui.com/docs/runtimes/data-stream
- Production in app copilots: I did not find reliable public architecture write ups with numbers; I make no claims about them.

How these compare to us on the UI side: they render a tool call card from start to end (start event, streaming args, result, approve button). We have the events (`AGENT_TOOL_CALL`, `AGENT_TOOL_RESULT`, `AGENT_TEXT_DELTA`) but the chat client applies results only at the end of the turn, and shows labels from `describeStep`.

Risk specific to our WebMCP layer (not verified in the endpoint code): `wholeshare_find_suppliers` posts straight to `/api/v1/suppliers/find` with `webSearch` allowed, and `wholeshare_start_group_buy` writes a prefill. The in server harness gates these with `PERMISSION_FOR_TOOL`. An outside agent using WebMCP may skip that gate unless the endpoint enforces `agentPermissions`. Check before demoing external agents.

## 4. Latency and reliability techniques with numbers

| Technique | What sources say | Source |
|---|---|---|
| Fewer model requests | Combine sequential steps; each request adds round trip | OpenAI latency guide above |
| Fewer output tokens | About 50 percent fewer output tokens can be about 50 percent less latency | same |
| Smaller prompts | 50 percent shorter prompt may only help 1 to 5 percent, but put dynamic content last to keep the shared prefix cacheable | same |
| Streaming | Cuts perceived wait to about a second; progress steps and loaders help | same |
| Speculative execution | Start likely next step early; correct guess adds about zero latency | same |
| Parallel tool calls | Independent read only calls are safe to run concurrently; all results go back together | Anthropic parallel tool use above |
| Plan then parallel execute | up to 3.7x vs ReAct, 1.35x vs OpenAI parallel calling, upper bounds | https://arxiv.org/abs/2312.04511 |
| Prompt caching | Exact prefix match; static first, dynamic last; Anthropic reads 0.1x; Fireworks discount 50 percent default on serverless, model page lists $0.015 cached vs $0.15 input for M3.1 Flash | https://docs.fireworks.ai/guides/prompt-caching , https://fireworks.ai/models/fireworks/minimax-m3p1-flash |
| Tool result trimming | Clear stale results; return only high signal fields; Anthropic cites 200KB to 1KB in a programmatic example | context engineering and advanced tool use posts above |
| Timeouts with partial results | Return the timeout as a tool result so the model recovers | OpenAI Agents SDK tools page above |
| Tool search / fewer tools | 85 percent fewer tool tokens, but cuts accuracy risk more than latency; changing tools invalidates cache | advanced tool use post; prompt caching page |
| Router (small model first) | Recommended pattern, no numbers | building effective agents |
| Execute tool when args finish streaming | Streaming protocols mark input complete before the response ends (Anthropic `content_block_stop`, AI SDK input end, OpenAI `.done`). No source gives a measured gain. | links above |

Conclusion from the OpenAI numbers: with an input of about 25 tools plus a 40 line prompt, input size is not our main cost. Model call count and output tokens are. That matches the measured 3 to 8 calls.

## 5. Provider specifics: MiniMax M3.1 Flash on Fireworks

Verified from Fireworks pages:
- Model id `minimax-m3p1-flash`, MoE with about 428B total and about 23B active parameters, about 1M context, function calling supported, vision input, serverless and dedicated. Price $0.15 input, $0.015 cached input, $0.60 output per 1M tokens. The page says reasoning is "always on with adjustable effort from low to max". https://fireworks.ai/models/fireworks/minimax-m3p1-flash
- Streaming tool calls: `delta.tool_calls` entries with `index`, `id`, `function.name`, `function.arguments` fragments, `finish_reason: "tool_calls"`. Our `_executeStream` follows this. https://docs.fireworks.ai/guides/function-calling
- `parallel_tool_calls` exists as a request parameter, default unset; the guide only says some models support parallel calls and to check capabilities. Nothing model specific for MiniMax (unverified for M3.1 Flash). https://docs.fireworks.ai/api-reference/post-chatcompletions
- `tool_choice`: auto, none, required/any, or a named function. Recommended temperature 0.0 to 0.3 for tool calls. Tool names a-z, A-Z, 0-9, underscore, dash, max 64. https://docs.fireworks.ai/guides/function-calling
- Streaming usage: usage is included by default in the final chunk. `perf_metrics_in_response` returns timing; non streaming responses carry `fireworks-server-time-to-first-token` style headers. https://docs.fireworks.ai/api-reference/post-chatcompletions , https://docs.fireworks.ai/guides/querying-text-models
- Prompt caching is automatic, exact prefix match, longest cached prefix reused. Caches live per replica, so send a stable `user` or `x-session-affinity` header, or `prompt_cache_key` (takes priority over `user`) so a conversation's calls hit the same replica. https://docs.fireworks.ai/guides/prompt-caching , https://docs.fireworks.ai/api-reference/post-chatcompletions
- Reasoning API: `reasoning_effort` accepts low, medium, high, xhigh, max, none, adaptive; "support varies by model" and `adaptive` is MiniMax M3 only. `reasoning_history` accepts disabled, interleaved, preserved. Reasoning arrives in `delta.reasoning_content`. https://docs.fireworks.ai/api-reference/post-chatcompletions , https://docs.fireworks.ai/guides/reasoning
- Serverless modes: `service_tier: "priority"` reduces load shedding (503). Fast (100+ tokens/s) and Ultra-fast (6 to 8x, preview) are separate router model ids; the page lists Kimi K3 Fast, GLM 5.3 Fast and a DeepSeek V4.1 Flash ultrafast, not MiniMax M3.1 Flash. Higher price, no multipliers given. https://docs.fireworks.ai/guides/serverless-modes

Conflicting or unverified:
- Can reasoning be turned off for M3.1 Flash? The API reference lists `none`, but the model page says "always on", and third party posts say `none` or disabled thinking returns a 400 for this model: https://www.eesel.ai/fr/blog/minimax-m3-1-flash-specs-tarifs-tester-preview , https://evolink.ai/blog/minimax-m3-1-flash-thinking-levels . Our `.env` sends `reasoning_effort: "none"`. If the request works, I could not confirm that it actually removes thinking, so it needs a direct test (item 1 below). If thinking is still running, it is probably the largest hidden source of latency.
- MiniMax's own guide (it describes M3.1 Flash on that page) says reasoning is optional per turn, and that for interleaved thinking the full assistant message including `reasoning_content` must be kept in history. It does not mention `reasoning_details`, parallel tool calls or streaming. https://platform.minimax.io/docs/guides/text-m3-function-call . Our loop does not keep `reasoning_content` or the `thinking` field in the history it re sends (it reads `assistantMessage.thinking`, and `_executeStream` does not capture `reasoning_content` deltas at all). With reasoning on, that can reduce quality across tool rounds.
- Price conflicts among aggregators ($0.15/$0.60 vs $0.05/$0.25). Use the Fireworks page. Our spend guard defaults to $0.30/$0.03/$1.20, so it overestimates cost about 2x (safe, but the budget stops early).

## 6. Comparison table

Legend: Y yes, P partial, N no, ? unverified.

| Dimension | WholeShare today | Claude Code / Agent SDK | OpenAI Agents SDK + Responses | Vercel AI SDK | LangGraph | browser-use / OpenHands |
|---|---|---|---|---|---|---|
| Loop | Custom, 3 to 8 serial model calls | Single loop, subagents for parallel work (secondary) | Runner loop | `stopWhen`, `prepareStep` | Graph with nodes | Loop; browser-use up to 10 actions per step |
| Text streaming | Server side done, client reply path partly | Y, raw events | Y, events | Y | Y, several modes | ? |
| Tool arg streaming used to start tools early | N (assembled, run after response) | Events available; no claim that Claude Code does this | Events available | Events available | ? | ? |
| Parallel tools | P (4 read tools prefetched; history format is serial, see item 4) | Allowed by API; you execute | ? (not on tools page) | ? | ToolNode parallel by default (secondary); disabled with interrupts | Multi action per step in browser-use |
| Permissions / human approval | Per tool user flags, step up suspend and resume | Permissions doc | `needs_approval` with pause and resume | Per tool approval (not verified here) | `interrupt()` | Sandbox (OpenHands) |
| Tool timeouts with recovery | Y (`withDeadline`, error as result) | ? | Y, `error_as_result` | ? | ? | ? |
| Context trimming | Last 6 turns at 400 chars; tool results not trimmed in loop | Tool result clearing, compaction | Not on page read | Not verified | Not verified | OpenHands condenser |
| Tool discovery | Fixed 25 tool list | Tool search available on API | Deferred loading + ToolSearchTool | `activeTools` per step | n/a | n/a |
| Prompt cache layout | Dynamic JSON before policy text, no cache key | Documented prefix order | ? | Provider level | n/a | n/a |
| Durable sessions | Y (steps saved, resume) but resume uses a different prompt | Sessions | Run state | n/a | Y, checkpointers | Event log (OpenHands) |
| Tool call UI | Labels after turn ends; SSE events exist | Streaming tool events | Events | Tool parts in UI stream | Stream modes | n/a |
| Eval | 100 prompt eval, 30 held out | n/a | n/a | n/a | n/a | n/a |

Where we are weaker, plainly:
1. The client waits for the whole turn before touching the UI. Every comparison harness streams tool start and result to the UI. Our server already emits the events; the chat does not use them for actions.
2. Parallelism is half done. We run some reads together, then write history as one assistant message per call (see `durable-harness.js`, the `messages.push` inside the `for (const call of toolCalls)` loop). The model sees a history of sequential single calls, which Anthropic's docs warn discourages parallel calls. The tool message id falls back to `call_${Date.now()}` if a call has no id, which can mismatch the assistant message.
3. Resolve then act costs a model call. `compare_groups` already accepts words; `join_group`, `schedule_*` and `file_damage_claim` still lean on a separate `resolve` first.
4. The prompt prefix is not cache friendly. The screen JSON is in the middle of the system message, so the policy text after it changes whenever the screen changes. Tool schemas come first, which is good, but the large policy block is not reused.
5. Reply check can add a full extra model call, and streamed draft text is shown before the check runs (it is reset on the next call, so the user may see a figure that then disappears).
6. Reasoning behavior is unverified, and `reasoning_content` is not preserved.
7. Awaited DB writes (`saveAgentStep`, Laya routing, `createAgentSession`) sit on the critical path. I did not measure them; they may be small.
8. Our own `AGENTS.md` mandates the Vercel AI SDK, and we do not use it.
9. Where we are stronger: server side argument guards, explicit permission flags, reply fact checking, a 100 prompt eval, and "no tool moves money". Most generic SDKs leave these to the developer.

## 7. Ranked changes (at most 12)

Effort is my estimate for one engineer, including test. Effects are estimates unless a source gives a number; none of them are measured on our traffic yet.

| # | Change | File | Expected effect | Effort | Source |
|---|---|---|---|---|---|
| 1 | Instrument first, then verify reasoning. Log per call: time to first token, total, `prompt_tokens`, `cached_tokens`, `completion_tokens_details` (reasoning tokens), via `perf_metrics_in_response`. Send one request with `reasoning_effort` of `none` and of `low`; confirm 400, ignored, or truly off. If thinking is on, set the lowest working value. | `src/lib/model-client.js`, `.env` | Could be the largest single saving (output tokens drive latency). Also gives the baseline per phase that every other item needs. | 1.5 h | https://docs.fireworks.ai/api-reference/post-chatcompletions , https://developers.openai.com/api/docs/guides/latency-optimization |
| 2 | Apply tool results in the chat as they happen. Make `askMosaic` read the SSE events for its session (`AGENT_TOOL_RESULT`, `AGENT_TEXT_DELTA`, final) and call `applyStepOnce` on each result, instead of after the full response. Show a card per tool call from `AGENT_TOOL_CALL` to result. | `src/web/react/mosaicAgent.ts`, `mosaicLive.ts` | Perceived latency: first visible action after one model call instead of the whole turn. Streaming is the most effective perceived latency tool per OpenAI. No change to total time. | 3 h | https://developers.openai.com/api/docs/guides/latency-optimization , https://code.claude.com/docs/en/agent-sdk/streaming-output |
| 3 | Merge resolve into act. Let `join_group`, `schedule_*`, `file_damage_claim`, `ui_open_group` accept the user's words and resolve server side with the same ranking as `resolveEntity`, returning the recommended match plus `alternatives`. Only return `needsInput` when scores tie and the action is costly. Also removes clarifying questions where a good default exists. | `src/lib/mosaic-tools.js`, `tool-registry.js`, prompt in `durable-harness.js` | Removes one model call (about 2 to 3 s by our own per call estimate) on most act turns, and fewer needless questions. | 4 h | https://platform.claude.com/docs/en/agents-and-tools/tool-use/define-tools (consolidate) , OpenAI guide (fewer requests) |
| 4 | Write history the way the protocol expects. One assistant message holding all `tool_calls`, followed by one `tool` message per call with the exact call id; never synthesize ids at push time. Add `parallel_tool_calls: true` to the request and keep the "call independent tools together" line. | `src/lib/durable-harness.js` (loop), `model-client.js` | Reliability, and keeps parallel calls from being unlearned within a turn. Cache prefix stays consistent between calls. Effect on MiniMax unmeasured (parallel support for this model is unverified). | 1.5 h | https://platform.claude.com/docs/en/agents-and-tools/tool-use/parallel-tool-use , https://docs.fireworks.ai/api-reference/post-chatcompletions |
| 5 | Fix the cache layout. Order: tools, static policy, then dynamic screen and profile JSON as the last system block or in the final user message. Send `prompt_cache_key` (or `x-session-affinity`) set to the chat session id. Do not change `tool_choice` or the tool list between calls of one turn (switching to `none` for the reply check is a cache cost; prefer an instruction instead). Confirm with `cached_tokens` from item 1. | `buildFocusedMessages`, `callModelWithTools` | Cheaper input (cached $0.015 vs $0.15 per 1M) and faster prefill; OpenAI says prompt trimming helps latency only 1 to 5 percent, so expect a modest time gain and a clear cost gain. | 1.5 h | https://docs.fireworks.ai/guides/prompt-caching , https://platform.claude.com/docs/en/build-with-claude/prompt-caching |
| 6 | Speculative resolve. When the request arrives, run `resolveEntity` for each entity type against the user's words while the first model call runs, and hand the candidates to the first tool call (or inject a short "likely matches" line in the user message). If the model asks for `resolve`, answer from the cache. | `durable-harness.js` (`startSession`), `mosaic-tools.js` | Can remove the resolve round trip for read and act turns without changing tools. Wrong guesses cost only an unused local lookup. Gain depends on item 3. | 4 h | https://developers.openai.com/api/docs/guides/latency-optimization (speculative execution) |
| 7 | Trim tool results. `query` returns rows with up to 14 fields; return the columns the question needs, a compact `columns` plus `rows` array form, a character cap (for example 6,000), and a `total`. Replace stale results from earlier turns in `history` with one line. Keep the full result in `saveAgentStep` and the UI artifact. | `src/lib/mosaic-tools.js`, `durable-harness.js` | Fewer prompt tokens per later call and less long output echo. Low direct time gain; protects against slow growth with real data. | 2 h | https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents |
| 8 | Let tools finish the turn without a second model call when the result is already a good answer. Tools that return a `speak` string (join_group, start_group_buy, setup_profile, schedule_*) end the loop directly; the model keeps writing text only for query, compare and research results. Keep the reply check for model written text. | `durable-harness.js`, tool results in `tool-registry.js` | Removes the final "answer" call on action turns (the call count is the main lever). Trade off: less varied wording, and the plan said the model writes replies, so limit this to fixed confirmations. | 3 h | https://developers.openai.com/api/docs/guides/latency-optimization ("don't default to an LLM") |
| 9 | Start a read tool when its arguments finish streaming. In `_executeStream`, when a tool call's JSON parses, begin `executeTool` for `PARALLEL_SAFE` tools immediately and keep the promise for the loop. Guard against partial JSON. | `src/lib/model-client.js`, `durable-harness.js` | Overlaps tool time with the rest of generation. Small for local reads (milliseconds), meaningful only for slow reads; do after items 1 to 8. | 3 h | https://platform.claude.com/docs/en/agents-and-tools/tool-use/fine-grained-tool-streaming , https://code.claude.com/docs/en/agent-sdk/streaming-output |
| 10 | Take non essential awaits off the critical path. Time `routeIntent`, `createAgentSession` and each `saveAgentStep`; make persistence fire and forget with an ordered queue, and run the Laya gate in parallel with the permission check. Keep writes ordered for resume. | `durable-harness.js`, `db.js` | Unknown until measured; likely tens to hundreds of ms per step. Skip if item 1 shows they are under 50 ms. | 2 h | measurement first |
| 11 | Progress and partial results for slow tools. Emit `AGENT_TOOL_PROGRESS` (queued, loading page, extracting) from Kernel and `track_shipment`; show an optimistic card in the chat; on deadline return what the tool has so far plus an error flag rather than an empty error. | `tool-registry.js`, `durable-harness.js`, `mosaicLive.ts` | Browser reads take seconds; progress changes how long they feel. Partial results make the 2 page budget less wasteful. | 3 h | https://openai.github.io/openai-agents-python/tools/ (timeout as result) |
| 12 | Make reply checking cheaper and invisible. Check the streamed draft at stop; hold display of figures until checked, or repair by substituting the figure from the tool result locally; only use a model retry for names it cannot fix. Count how often retries happen in the eval. | `durable-harness.js`, `reply-check.js`, `mosaicLive.ts` | Avoids a full extra call on mismatches and avoids showing then retracting a wrong draft. Frequency of mismatch is unknown. | 2 h | internal; pattern from OpenAI guide (guardrails in parallel) |

Rough total: about 30 h. Suggested order for a first week: 1, 5, 4, 2, 3, then re-measure before doing 6 to 12.

Not recommended now:
- Migrating to the Vercel AI SDK or LangGraph. Cost is high (our guards, step up, durable steps and eval all hang on the current loop), and I could not confirm the AI SDK's concurrent tool execution from docs. Borrow its stream event model instead (item 2), and update the `AGENTS.md` rule to say why.
- Tool search or `activeTools` narrowing. With about 25 tools the Anthropic numbers (58 tools, 55K tokens) do not apply, and changing the tool list per step invalidates the cache.
- A separate small router model. Anthropic recommends routing, but our model is already a small Flash class MoE, and the prompt has no cheap class of request that needs no tools. The existing Laya route is a regex style rule engine; the generalization plan forbids phrasing specific shortcuts, and I agree.
- Fireworks Fast or Ultra-fast modes. Those are offered for other models; I found no M3.1 Flash router id. `service_tier: "priority"` is documented for chat completions and is cheap to test (30 minutes) if 503s or load shedding show up in the logs.

## 8. WebMCP follow ups (small)

- Reword the `docs/HARNESS.md` sentence that says tools are declared "as described in AG Grid's post" to cite the WebMCP proposal for the API and AG Grid only for the Studio tool list.
- Keep `document.modelContext` and `navigator.modelContext` both checked; add a `toolchange` listener only if you later need to react to other pages' tools.
- Decide what consent means for outside agents (spec leaves it open): add `agentPermissions` checks to the server endpoints behind `wholeshare_find_suppliers` and the prefill tool, or mark them as needing a user confirm in the UI.
- Add `AbortSignal` support in `registerWebMcpTool` to match the proposal, and re-register a tool when its description changes (the proposal says definitions are loaded once into model context).

## 9. Open questions I could not close

- Parallel tool call support and ordering behavior of MiniMax M3.1 Flash on Fireworks.
- Whether `reasoning_effort: "none"` is honored, ignored, or rejected for this model.
- Whether the AI SDK, OpenAI Agents SDK and LangGraph ToolNode run multiple calls concurrently by default (primary docs not reached).
- Measured gain of starting tools on argument completion (no source gives a number).
- Chrome 149 origin trial and the `document.modelContext` move (secondary sources only).
- browser-use `flash_mode` effect, and OpenHands condenser savings (no primary numbers).
