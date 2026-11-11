import { querySource } from "./data-sources.js";
import { findUnsupportedFigures, findUnsupportedNames } from "./reply-check.js";
import { WHOLESHARE_TOOL_DECLARATIONS, executeTool, parseToolCallsFromContent } from "./tool-registry.js";
import { actionDispatcher } from "./web-actions.js";
import {
  createAgentSession,
  updateAgentSessionStatus,
  saveAgentStep,
  loadSessionTrajectory
} from "./db.js";
import { interceptToolExecution } from "./interceptor.js";
import { loadUserSettings } from "./user-settings.js";
import { getScheduleState } from "./schedule-service.js";
import { getEvidence } from "./evidence-store.js";
import { mosaicProvider } from "./mosaic-config.js";
import { generateInstinctProfileHeader } from "./instinct-profile.js";
import { generateFeatureMapPromptContext } from "./feature-map.js";
import { dreamingEngine } from "./dreaming-engine.js";
import { modelClient } from "./model-client.js";
import { opsdEngine } from "./opsd-engine.js";
import { SERVING_TARGET } from "./serving-target.js";

const MAX_TURNS = 8;
const MAX_REFLEXIVE_ATTEMPTS = 2;
const AGENT_TIMEOUT_MS = 90000;
const STEP_UP_THRESHOLD_CENTS = 100000;

// Interactive Mosaic surfaces only need the tools that drive the app. Sending all 60 schemas
// costs about 9,000 prompt tokens per turn, which dominates latency on a small local model.
const FOCUSED_SOURCES = new Set(["mosaic-deep-work", "workspace-copilot"]);
const FOCUSED_TOOL_NAMES = new Set([
  "ui_navigate_view",
  "query",
  "resolve",
  "compare_groups",
  "join_group",
  "setup_profile",
  "present",
  "kernel_research_web_fact",
  "kernel_read_supplier_site",
  "track_shipment",
  "send_invoice_reminder",
  "page_tool",
  "find_suppliers",
  "start_group_buy",
  "schedule_move_delivery",
  "schedule_extend_inspection",
  "schedule_book_slot",
  "schedule_resolve_conflicts",
  "schedule_undo",
  "ui_open_group",
  "ui_open_report",
  "ui_open_my_group",
  "query_escrow_ledger",
  "open_paypal_dashboard",
  "file_damage_claim",
  "get_clan_constitution",
  "explain_escrow_document"
]);
// Independent reads can run together. A slow tool gets a deadline so the model can answer with what it has.
const PARALLEL_SAFE = new Set(["query", "resolve", "compare_groups", "query_escrow_ledger"]);
const DEADLINES_MS = { track_shipment: 45000, kernel_read_supplier_site: 50000, kernel_research_web_fact: 40000, find_suppliers: 60000 };

function withDeadline(toolName, promise) {
  const limit = DEADLINES_MS[toolName] ?? 30000;
  let timer;
  const late = new Promise((resolveLate) => {
    timer = setTimeout(() => resolveLate({ error: `That took longer than ${Math.round(limit / 1000)} seconds and was stopped. Answer from what you already have and say what is missing.` }), limit);
  });
  return Promise.race([promise, late]).finally(() => clearTimeout(timer));
}

function parseCallArgs(call) {
  try {
    const raw = call.function?.arguments ?? call.arguments ?? {};
    return typeof raw === "string" ? JSON.parse(raw) : raw;
  } catch {
    return {};
  }
}

// What goes back into the model's history. Never undefined, never huge, and no server file paths.
function capToolMessage(result) {
  let text = JSON.stringify(result ?? {}, (key, value) => (key === "filePath" || key === "proof" ? undefined : value)) ?? "{}";
  if (text.length > 8000) text = JSON.stringify({ truncated: true, note: "The result was too long, so it was cut.", start: text.slice(0, 7000) });
  return text;
}

// A browser read takes several seconds. After two pages the model has to answer with what it has.
function kernelBudget(toolName, count) {
  if ((toolName !== "kernel_research_web_fact" && toolName !== "kernel_read_supplier_site") || count <= 2) return null;
  return { error: "Two web pages were already read for this question. Answer now from what they returned, and say what you could not confirm." };
}

const userText = (messages) => messages.filter((message) => message.role === "user").map((message) => message.content).join(" ");

const PRODUCT_TOOLS = new Set(["find_suppliers", "start_group_buy"]);
const stem = (word) => (word.length > 3 && word.endsWith("s") ? word.slice(0, -1) : word);
const wordsOf = (text) => String(text ?? "").toLowerCase().split(/[^a-z0-9]+/).filter((word) => word.length > 2).map(stem);

// A product must come from the user's own words, never from screen context or the model's memory.
function productGuard(toolName, toolArgs, messages) {
  if (!PRODUCT_TOOLS.has(toolName)) return null;
  const said = new Set(messages.filter((message) => message.role === "user").flatMap((message) => wordsOf(message.content)));
  const product = wordsOf(toolArgs?.product);
  if (product.length > 0 && product.some((word) => said.has(word))) return null;
  return { needsInput: true, question: "What would you like to buy? Tell me the product, and the city and units if you know them. I will search for suppliers and set up the group." };
}

export const PERMISSION_FOR_TOOL = {
  ui_filter_clans: { flag: "allowAutonomousFilterSort", label: "search and filter groups" },
  prepare_pledge_quote: { flag: "allowAutonomousQuotePrep", label: "prepare pledge quotes" },
  file_damage_claim: { flag: "allowAutonomousDraftMessages", label: "draft messages and claims" },
  setup_profile: { flag: "allowAutonomousDraftMessages", label: "update your profile" },
  send_invoice_reminder: { flag: "allowAutonomousDraftMessages", label: "send invoice reminders" },
  page_tool: { flag: "allowAutonomousFilterSort", label: "filter, sort and chart what is on your screen" },
  start_group_buy: { flag: "allowAutonomousDraftMessages", label: "prepare a group buy for you to review" },
  find_suppliers: { flag: "allowAutonomousResearch", label: "find and research suppliers" },
  kernel_research_web_fact: { flag: "allowAutonomousResearch", label: "research suppliers on the web" },
  kernel_read_supplier_site: { flag: "allowAutonomousResearch", label: "research suppliers on the web" },
  track_shipment: { flag: "allowAutonomousResearch", label: "research suppliers on the web" },
  schedule_move_delivery: { flag: "allowAutonomousScheduleChanges", label: "change delivery schedules" },
  schedule_extend_inspection: { flag: "allowAutonomousScheduleChanges", label: "change delivery schedules" },
  schedule_book_slot: { flag: "allowAutonomousScheduleChanges", label: "change delivery schedules" },
  schedule_resolve_conflicts: { flag: "allowAutonomousScheduleChanges", label: "change delivery schedules" },
  schedule_undo: { flag: "allowAutonomousScheduleChanges", label: "change delivery schedules" }
};

function permissionBlock(toolName) {
  const rule = PERMISSION_FOR_TOOL[toolName];
  if (!rule) return null;
  const allowed = loadUserSettings().agentPermissions?.[rule.flag] === true;
  return allowed ? null : { status: "BLOCKED", blocked: true, permission: rule.flag, permissionLabel: rule.label, message: `Mosaic is not allowed to ${rule.label} yet. Allow it in Settings or with the Allow button.` };
}

export const FOCUSED_TOOL_DECLARATIONS = WHOLESHARE_TOOL_DECLARATIONS.filter((tool) => FOCUSED_TOOL_NAMES.has(tool.function?.name));
const focusedSessions = new Set();
const stepUpApprovedSessions = new Set();
const sessionEvidence = new Map();

// A vision capable hosted model gets the attached photos itself, so it can describe real damage in the claim notes.
// The local text-only model never receives images and is told it cannot see them.
function withVision(messages, evidence) {
  if (!Array.isArray(evidence) || evidence.length === 0) return messages;
  if (mosaicProvider() === "local" || process.env.MOSAIC_VISION === "false") return messages;
  const images = [];
  for (const item of evidence.slice(0, 3)) {
    const found = getEvidence(String(item.evidenceId ?? ""));
    if (found && found.buffer.length <= 3 * 1024 * 1024) images.push({ type: "image_url", image_url: { url: `data:${found.record.mimeType};base64,${found.buffer.toString("base64")}` } });
  }
  if (images.length === 0) return messages;
  const out = messages.map((message) => ({ ...message }));
  const system = out.find((message) => message.role === "system");
  if (system) system.content = system.content.replace("You cannot see the photos. Never say what is in a photo.", "You can see the attached photos. Put only what you can actually see in notes, and never claim more than the photo shows.");
  const last = out[out.length - 1];
  last.content = [{ type: "text", text: last.content }, ...images];
  return out;
}

export class WholeshareDurableHarness {
  constructor(model = null) {
    this.model = model || ((modelClient.preferLocal || !modelClient.openRouterKey)
      ? SERVING_TARGET.mlxId
      : "nvidia/nemotron-3.5-super-vl:free");
  }

  buildFocusedMessages(prompt, context = {}) {
    const { evidence: _evidence, history, ...rest } = context ?? {};
    const priorTurns = Array.isArray(history) ? history.slice(-6).filter((turn) => turn && typeof turn.text === "string" && (turn.role === "user" || turn.role === "assistant")).map((turn) => ({ role: turn.role, content: turn.text.slice(0, 400) })) : [];
    let profile = {};
    try {
      const saved = loadUserSettings().profile ?? {};
      profile = { businessName: saved.businessName, city: saved.city, country: saved.country, currency: saved.currency };
      // What their own documents showed, so a comparison can say what a group saves against what they pay today.
      if (saved.currentSupplier && saved.currentUnitPriceUsd) profile.payToday = { supplier: saved.currentSupplier, unitPriceUsd: saved.currentUnitPriceUsd, product: saved.product, units: saved.units };
    } catch {
      profile = {};
    }
    const screen = JSON.stringify({ page: rest, profile }).slice(0, 2800);
    return [
      {
        role: "system",
        content: `You are Mosaic, the assistant inside WholeShare, a B2B group buying app on PayPal. You help people find and compare buying groups, join them, start new ones, set up their account, source suppliers, manage deliveries, handle disputes and see their PayPal position.
Policy:
- Never show internal ids to the user: no clan-, claim-, coalition_, sme_ or del- ids, and no raw codes such as DAMAGED_TRANSIT. Use names, products and plain words. Keep ids for tool calls only.
- Call independent tools together in one turn, and read data with one query instead of several. Facts come from tools. Never invent groups, prices, ids, totals, dates or shipment facts. To answer a question about data, call query (it returns real rows and totals), then answer from those rows. When the user wants to see, list or browse items, call query with show true and a short title: it opens the table beside the chat in the same call. Use present only for the timeline, the claims board or the PayPal invoice list.
- Words the user uses for a group, shipment, supplier, claim or invoice are not ids. Call resolve first, then use the id it returns. When several items match equally, use the recommended one and say in your reply which you chose and that the user can switch. Ask which one only when a wrong choice would be costly and nothing in the request or the page points to one. Do not call resolve before compare_groups, join_group, track_shipment, the schedule tools or file_damage_claim, because they match the user's words themselves.
- Compare groups: call compare_groups with the user's words for each group (it resolves them and shows the groups itself, so do not call present after it), then say which factor decides it and what the user gives up. Join a group: resolve it, then join_group, which opens the PayPal approval step. You never approve payments or move money.
- Start a group: you need the product. If it is missing, ask one short question and call no tool. Otherwise call find_suppliers with the product and webSearch true, then start_group_buy with what the user said, including shipmentMode and shipmentPoints when they named where the order should arrive (one receiving point or several). The form asks for anything still missing.
- Set up the account or change profile details: call setup_profile with only the fields the user stated.
- Suppliers: find_suppliers for options. Directory entries are samples and web leads are unverified, so say so. kernel_read_supplier_site gets prices and minimum order from a supplier website. kernel_research_web_fact checks one fact on the web. Read at most two pages per question.
- Deliveries: use the schedule tools. Pass the user's product words as the shipment, or an id from resolve. Days earlier is negative. If a rule rejects the change, tell the user the allowed range.
- Disputes: track_shipment first when the question is where something is or whether it is late. file_damage_claim needs the damaged units, a reason and the product words. Photos the user attached are listed in the context. Claims stay drafts for the user to review.
- PayPal: send_invoice_reminder reminds someone about one open invoice, only when the user asks. ui_open_report page paypal for the overview, query paypal_invoices or ledger for numbers, ui_navigate_view view paypal for invoice and dispute operations. open_paypal_dashboard only when the user asks for PayPal's own website.
- To change what is on screen (filter, sort, group or chart the table beside the chat, zoom or switch a Bryntum view, edit an AG Studio report) call page_tool with a tool name from page.pageTools. Use the column ids from the grid. Read the result and tell the user what changed. When the user wants to filter, sort, group or chart data, show it as a table first with query show true and view grid. If a page tool says no grid is on screen, do that, then retry.
- Stay in the chat. Answer questions with query. Navigate (ui_navigate_view, ui_open_group, ui_open_my_group) only when the user asks to go somewhere or open something.
- If a needed detail is missing or the request is ambiguous, ask one short question and call no tool.
- All PayPal activity in this app runs in the PayPal sandbox. Say so briefly when you talk about payments, holds, invoices or payouts, and never imply real money moved.
- When the profile has payToday, compare group prices with what the business pays today and state the saving in dollars for its units. Only use numbers from payToday and the tools.
- After tools run, reply in one or two plain sentences that name the specifics.
What the user is looking at and who they are (JSON): ${screen}`
      },
      ...priorTurns,
      { role: "user", content: prompt }
    ];
  }

  buildInitialMessages(prompt, buyerId = "sme_austin_01") {
    const profileHeader = generateInstinctProfileHeader(buyerId);
    const featureMapContext = generateFeatureMapPromptContext();
    return [
      {
        role: "system",
        content: `${profileHeader}

${featureMapContext}

You are the autonomous procurement agent for Wholeshare, a B2B group purchasing platform on PayPal.
Follow this operational protocol for sourcing, verification, and escrow:
1. REAL-TIME FACTS, SUPPLIERS, & REGULATORY RESEARCH: When real-time or external facts are needed from the web (supplier pricing, regulatory status, corporate KYC, forex spot rates, sanctions screening, or technical specs), use Kernel cloud browsers:
   - For live facts, forex rates, corporate registry checks, or compliance verification: use kernel_research_web_fact with intent, targetUrl, and query.
   - For distributor volume pricing tiers: use discover_wholesale_supplier_tiers with sku and vendorUrl.
   - For custom Playwright DOM automation: use kernel_execute_browser_task with targetUrl and script.
2. INTERNAL CATALOG: When querying Wholeshare's own existing catalog without an external supplier URL, use discover_wholesale_catalog with sku.
3. ZERO SIMULATION MANDATE: Never estimate, fabricate, or hallucinate pricing brackets, forex rates, or KYC clearances if web extraction fails or data is missing. Explain the failure honestly and request authentic documents or URLs.
4. FINANCIAL CONSERVATION: All financial operations must use exact integer cents and intent: "AUTHORIZE". Direct CAPTURE is prohibited.
5. COMPLETION: When all requested operations have been performed (such as locking escrow), stop calling tools and return a concise final summary message.
6. REFLEXIVE RECOVERY: If a tool execution returns an invariant violation error, reflexively adjust your arguments to satisfy the invariant and retry.`
      },
      {
        role: "user",
        content: prompt
      }
    ];
  }


  async startSession({ prompt, sessionId = `sess_${Date.now()}`, metadata = {}, maxTurns = 3 }) {
    const sessionStartTime = Date.now();
    if (FOCUSED_SOURCES.has(metadata?.source)) focusedSessions.add(sessionId);
    if (Array.isArray(metadata?.context?.evidence)) sessionEvidence.set(sessionId, metadata.context.evidence);
    await createAgentSession({
      id: sessionId,
      model: this.model,
      prompt,
      status: "RUNNING",
      metadata
    });

    actionDispatcher.broadcast("AGENT_SESSION_STARTED", {
      sessionId,
      prompt,
      model: this.model,
      timestamp: new Date().toISOString()
    });

    const messages = FOCUSED_SOURCES.has(metadata?.source) ? withVision(this.buildFocusedMessages(prompt, metadata?.context), metadata?.context?.evidence) : this.buildInitialMessages(prompt);
    return await this.runExecutionLoop({
      sessionId,
      messages,
      startStepIndex: 1,
      sessionStartTime,
      maxTurns
    });
  }

  async resumeSession(sessionId, options = {}) {
    const trajectory = await loadSessionTrajectory(sessionId);
    if (!trajectory) {
      throw new Error(`Session ${sessionId} not found.`);
    }

    if (trajectory.status === "COMPLETED") {
      return trajectory;
    }

    const sessionStartTime = Date.now();
    await updateAgentSessionStatus(sessionId, "RUNNING");

    actionDispatcher.broadcast("AGENT_SESSION_RESUMED", {
      sessionId,
      status: "RUNNING",
      timestamp: new Date().toISOString()
    });

    const messages = this.buildInitialMessages(trajectory.prompt);
    const existingSteps = trajectory.steps || [];

    for (const s of existingSteps) {
      if (s.toolName) {
        messages.push({
          role: "assistant",
          content: s.thought || "",
          tool_calls: [
            {
              id: `call_${s.stepIndex}`,
              type: "function",
              function: {
                name: s.toolName,
                arguments: JSON.stringify(s.toolArgs || {})
              }
            }
          ]
        });

        messages.push({
          role: "tool",
          tool_call_id: `call_${s.stepIndex}`,
          content: capToolMessage(s.toolResult)
        });
      }
    }

    return await this.runExecutionLoop({
      sessionId,
      messages,
      startStepIndex: existingSteps.length + 1,
      sessionStartTime,
      maxTurns: options?.maxTurns || 3
    });
  }

  async resumeWithStepUpApproval(sessionId, approvalToken, options = {}) {
    const trajectory = await loadSessionTrajectory(sessionId);
    if (!trajectory) {
      throw new Error(`Session ${sessionId} not found.`);
    }

    if (trajectory.status !== "AWAITING_STEP_UP") {
      throw new Error(`Session ${sessionId} is not awaiting step-up verification.`);
    }

    stepUpApprovedSessions.add(sessionId);
    await updateAgentSessionStatus(sessionId, "RUNNING", { approvalToken });

    actionDispatcher.broadcast("AGENT_STEP_UP_APPROVED", {
      sessionId,
      approvalToken,
      timestamp: new Date().toISOString()
    });

    const messages = this.buildInitialMessages(trajectory.prompt);
    for (const s of trajectory.steps || []) {
      if (s.toolName) {
        messages.push({
          role: "assistant",
          content: s.thought || "",
          tool_calls: [
            {
              id: `call_${s.stepIndex}`,
              type: "function",
              function: {
                name: s.toolName,
                arguments: JSON.stringify(s.toolArgs || {})
              }
            }
          ]
        });
        messages.push({
          role: "tool",
          tool_call_id: `call_${s.stepIndex}`,
          content: capToolMessage(s.toolResult)
        });
      }
    }

    messages.push({
      role: "user",
      content: `Human KYC step-up approval verified with token ${approvalToken}. Proceed with authorized escrow locking.`
    });

    return await this.runExecutionLoop({
      sessionId,
      messages,
      startStepIndex: (trajectory.steps?.length || 0) + 1,
      sessionStartTime: Date.now(),
      maxTurns: options?.maxTurns || 3
    });
  }

  async runExecutionLoop({ sessionId, messages, startStepIndex, sessionStartTime, maxTurns = 3 }) {
    let turn = startStepIndex;
    let finalMessage = "";
    let reflexiveRetries = 0;
    const kernelCalls = [0, 0];
    const turnEvidence = [];
    let toolsRun = 0;
    let replyChecked = false;

    let forceTool = null;
    while (turn <= maxTurns) {
      const stepStartTime = Date.now();

      try {
        const toolsAllowed = forceTool !== "none";
        const response = await this.callModelWithTools(messages, sessionId, forceTool);
        forceTool = null;
        const durationMs = Date.now() - stepStartTime;

        const assistantMessage = response.message || {};
        const thinking = assistantMessage.thinking || "";
        let content = assistantMessage.content || "";
        let toolCalls = assistantMessage.tool_calls || [];
        // Text that looks like a tool call only counts when tools are allowed this turn.
        if (toolCalls.length === 0 && content && toolsAllowed) {
          toolCalls = parseToolCallsFromContent(content);
        }
        // A model may only run the tools it was offered. Anything else, including a name it invented, is dropped.
        if (focusedSessions.has(sessionId)) {
          const attempted = toolCalls.length;
          toolCalls = toolCalls.filter((call) => FOCUSED_TOOL_NAMES.has(call.function?.name || call.name));
          if (attempted > 0 && toolCalls.length === 0) content = "I can only use the tools WholeShare offers here, so I did not do that.";
          else if (!toolsAllowed && content && /^\s*[{[]/.test(content)) content = "";
        }
        toolCalls = toolCalls.map((call, position) => (call.id ? call : { ...call, id: `call_${Date.now()}_${position}` }));
        let assistantRecorded = false;

        if (thinking) {
          actionDispatcher.broadcast("AGENT_THOUGHT", {
            sessionId,
            stepIndex: turn,
            thought: thinking.substring(0, 300)
          });
        }

        if (toolCalls.length === 0 && focusedSessions.has(sessionId) && !replyChecked && turnEvidence.length > 0 && content) {
          replyChecked = true;
          const unsupported = [...findUnsupportedFigures(content, turnEvidence, userText(messages)), ...findUnsupportedNames(content, turnEvidence, userText(messages))];
          if (unsupported.length > 0) {
            messages.push({ role: "assistant", content });
            messages.push({ role: "user", content: `Your reply stated figures or names that no tool returned: ${unsupported.join(", ")}. Rewrite it using only figures and names from the tool results, or say you do not have them. Do not call tools.` });
            forceTool = "none";
            turn++;
            continue;
          }
        }

        if (toolCalls.length === 0) {
          finalMessage = content || "Operation completed successfully.";
          await saveAgentStep({
            sessionId,
            stepIndex: turn,
            thought: thinking,
            interceptorStatus: "PASSED",
            durationMs
          });

          await updateAgentSessionStatus(sessionId, "COMPLETED", {
            finalMessage,
            totalDurationMs: Date.now() - sessionStartTime
          });

          break;
        }

        // Start independent reads together so a turn with several of them waits for the slowest, not the sum.
        const prefetched = new Map();
        if (toolCalls.length > 1 && focusedSessions.has(sessionId)) {
          for (const call of toolCalls) {
            const name = call.function?.name || call.name;
            if (PARALLEL_SAFE.has(name) && !permissionBlock(name)) prefetched.set(call, withDeadline(name, executeTool(name, parseCallArgs(call)).catch((err) => ({ error: err.message }))));
          }
        }

        for (const call of toolCalls) {
          const toolName = call.function?.name || call.name;
          // At most five tool calls per question, even when the model sends many in one turn.
          if (focusedSessions.has(sessionId) && toolsRun >= 5) {
            if (!assistantRecorded) {
              assistantRecorded = true;
              messages.push({ role: "assistant", content: content || "", tool_calls: toolCalls.map((each) => ({ ...each, function: { ...(each.function || { name: each.name }), arguments: JSON.stringify(parseCallArgs(each)) } })) });
            }
            messages.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify({ skipped: "Enough tools have run for this question. Answer from what you have." }) });
            continue;
          }
          if (toolName === "present" && finalMessage) {
            if (!assistantRecorded) {
              assistantRecorded = true;
              messages.push({ role: "assistant", content: content || "", tool_calls: toolCalls.map((each) => ({ ...each, function: { ...(each.function || { name: each.name }), arguments: JSON.stringify(parseCallArgs(each)) } })) });
            }
            messages.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify({ skipped: "A table is already on screen for this turn." }) });
            continue;
          }
          let toolArgs = {};
          let argsInvalid = false;
          try {
            toolArgs = typeof call.function?.arguments === "string"
              ? JSON.parse(call.function.arguments)
              : (call.function?.arguments || call.arguments || {});
          } catch {
            toolArgs = {};
            argsInvalid = true;
          }
          // The step-up approval comes from the person through resumeWithStepUpApproval, never from the model's own arguments.
          delete toolArgs.stepUpApproved;
          if (toolName === "page_tool" && focusedSessions.has(sessionId)) toolArgs = { ...toolArgs, sessionId };

          actionDispatcher.broadcast("AGENT_TOOL_CALL", {
            sessionId,
            stepIndex: turn,
            toolName,
            args: toolArgs
          });

          // Risk label comes from the tool's declared effect.
          const mutating = (TOOL_EFFECT[toolName] ?? "read") !== "read";
          actionDispatcher.broadcast("AGENT_TOOL_GATED", { sessionId, stepIndex: turn, toolName, mutating });

          const interception = interceptToolExecution(toolName, toolArgs);

          if (!interception.valid) {
            const verifierError = interception.violations.join("; ");
            try {
              const teacherCorrection = await opsdEngine.rationalizeCorrection({
                prompt: messages[1]?.content || "",
                studentThought: thinking,
                studentToolCall: { name: toolName, arguments: toolArgs },
                verifierError
              });

              opsdEngine.commitDistillationTrace({
                sessionId,
                prompt: messages[1]?.content || "",
                studentThought: thinking,
                studentToolCall: { name: toolName, arguments: toolArgs },
                verifierError,
                teacherThought: teacherCorrection.teacherThought,
                correctedToolCall: teacherCorrection.correctedToolCall
              });
            } catch {
              // OPSD recording failure should not crash execution
            }

            actionDispatcher.broadcast("AGENT_REFLEXIVE_RETRY", {
              sessionId,
              stepIndex: turn,
              toolName,
              violations: interception.violations
            });

            await saveAgentStep({
              sessionId,
              stepIndex: turn,
              thought: thinking,
              toolName,
              toolArgs,
              toolResult: { error: "INTERCEPTOR_VIOLATION", violations: interception.violations },
              interceptorStatus: "REJECTED",
              violations: interception.violations,
              durationMs: Date.now() - stepStartTime
            });

            if (!assistantRecorded) {
              assistantRecorded = true;
              messages.push({ role: "assistant", content: content || "", tool_calls: toolCalls.map((each) => ({ ...each, function: { ...(each.function || { name: each.name }), arguments: JSON.stringify(parseCallArgs(each)) } })) });
            }

            messages.push({
              role: "tool",
              tool_call_id: call.id,
              content: JSON.stringify({
                status: "REJECTED_BY_INTERCEPTOR",
                violations: interception.violations,
                instruction: "Fix the invariant violation and retry with valid arguments."
              })
            });

            reflexiveRetries++;
            if (reflexiveRetries > MAX_REFLEXIVE_ATTEMPTS) {
              throw new Error(`Max reflexive attempts exceeded on tool ${toolName}.`);
            }

            continue;
          }

          const targetAmount = Number(toolArgs.amountCents || toolArgs.maxAutoAuthorizeUsd * 100 || 0);
          if (toolName === "authorize_paypal_escrow" && (!Number.isFinite(targetAmount) || targetAmount <= 0) && !stepUpApprovedSessions.has(sessionId)) {
            messages.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify({ error: "A valid amount is required to authorize an escrow." }) });
            continue;
          }
          if (targetAmount > STEP_UP_THRESHOLD_CENTS && !stepUpApprovedSessions.has(sessionId) && toolName === "authorize_paypal_escrow") {
            const invoice = await executeTool("generate_step_up_invoice", {
              buyerId: toolArgs.coalitionId || "coalition_flour_01",
              amountCents: targetAmount,
              memo: "Step-up KYC verification required for escrow authorization exceeding $1,000 ceiling."
            });

            await saveAgentStep({
              sessionId,
              stepIndex: turn,
              thought: thinking,
              toolName,
              toolArgs,
              toolResult: { status: "AWAITING_STEP_UP", invoice },
              interceptorStatus: "PASSED",
              durationMs: Date.now() - stepStartTime
            });

            await updateAgentSessionStatus(sessionId, "AWAITING_STEP_UP", {
              stepUpToken: invoice.invoiceId,
              finalMessage: "Session suspended awaiting KYC step-up authentication."
            });

            actionDispatcher.broadcast("AGENT_SUSPENDED_STEP_UP", {
              sessionId,
              stepIndex: turn,
              invoiceId: invoice.invoiceId,
              qrCodeUrl: invoice.qrCodeUrl
            });

            return {
              sessionId,
              status: "AWAITING_STEP_UP",
              invoice,
              suspendedAtStep: turn
            };
          }

          if (toolName === "file_damage_claim") {
            const attached = sessionEvidence.get(sessionId) ?? [];
            toolArgs = { ...toolArgs, photoUrls: attached.map((item) => item.uri), detectedTracking: attached.flatMap((item) => item.detectedTrackingNumbers ?? [])[0] };
          }
          const toolResult = (argsInvalid && { error: "The tool arguments were not valid JSON. Call the tool again with valid arguments." }) || (focusedSessions.has(sessionId) && permissionBlock(toolName)) || productGuard(toolName, toolArgs, messages) || kernelBudget(toolName, (kernelCalls[0] += /^kernel_/.test(toolName) ? 1 : 0)) || await (prefetched.get(call) ?? withDeadline(toolName, executeTool(toolName, toolArgs)));

          if (toolResult && toolResult.status === "ERROR") {
            const verifierError = toolResult.error || "Tool execution failed policy invariant.";
            try {
              const teacherCorrection = await opsdEngine.rationalizeCorrection({
                prompt: messages[1]?.content || "",
                studentThought: thinking,
                studentToolCall: { name: toolName, arguments: toolArgs },
                verifierError
              });

              opsdEngine.commitDistillationTrace({
                sessionId,
                prompt: messages[1]?.content || "",
                studentThought: thinking,
                studentToolCall: { name: toolName, arguments: toolArgs },
                verifierError,
                teacherThought: teacherCorrection.teacherThought,
                correctedToolCall: teacherCorrection.correctedToolCall
              });
            } catch {
              // Non-blocking trace capture
            }
          }

          actionDispatcher.broadcast("AGENT_TOOL_RESULT", {
            sessionId,
            stepIndex: turn,
            toolName,
            result: toolResult
          });

          await saveAgentStep({
            sessionId,
            stepIndex: turn,
            thought: thinking,
            toolName,
            toolArgs,
            toolResult,
            interceptorStatus: "PASSED",
            durationMs: Date.now() - stepStartTime
          });

          // One assistant message carries every call of the turn, so the model sees that calling several tools together is normal.
          if (!assistantRecorded) {
            assistantRecorded = true;
            messages.push({
              role: "assistant",
              content: content || "",
              tool_calls: toolCalls.map((each) => ({ ...each, function: { ...(each.function || { name: each.name }), arguments: JSON.stringify(each === call ? toolArgs : parseCallArgs(each)) } }))
            });
          }

          const toolMessage = toolResult;
          messages.push({
            role: "tool",
            tool_call_id: call.id,
            content: capToolMessage(toolMessage)
          });
          if (toolResult?.needsInput) finalMessage = toolResult.question;
          // A tool that already says what happened ends the turn without another model call.
          if (focusedSessions.has(sessionId) && toolCalls.length === 1 && typeof toolResult?.speak === "string" && toolResult.status === "SUCCESS") finalMessage = toolResult.speak;
          if (focusedSessions.has(sessionId) && toolCalls.length === 1 && /^schedule_/.test(toolName) && toolResult?.status === "SUCCESS" && typeof toolResult.summary === "string") finalMessage = toolResult.summary;
          if (toolName === "start_group_buy" && toolResult?.status === "SUCCESS") {
            finalMessage = "Opened the Start a group buy form with what I found. Review it and publish when you are ready.";
          }
          if ((toolName === "present" || toolName === "ui_open_report" || (toolName === "query" && toolResult?.action === "PRESENT")) && toolResult?.status === "SUCCESS") forceTool = "none";
          turnEvidence.push(toolResult);
          toolsRun += 1;
          if (focusedSessions.has(sessionId) && toolsRun >= 5) forceTool = "none";
        }
        if (finalMessage && focusedSessions.has(sessionId)) {
          await updateAgentSessionStatus(sessionId, "COMPLETED", {
            finalMessage,
            totalDurationMs: Date.now() - sessionStartTime
          });
          break;
        }
      } catch (err) {
        actionDispatcher.broadcast("AGENT_FAILURE", {
          sessionId,
          error: `REAL_LLM_FAILURE: ${err.message}`,
          timestamp: new Date().toISOString()
        });
        await updateAgentSessionStatus(sessionId, "FAILED", {
          finalMessage: `Real model failure: ${err.message}`,
          totalDurationMs: Date.now() - sessionStartTime
        });
        throw new Error(`Durable agent execution failed at model level: ${err.message}`);
      }

      turn++;
    }

    if (!finalMessage && focusedSessions.has(sessionId) && turnEvidence.length > 0) {
      try {
        const wrap = await modelClient.callChat({
          onText: this.streamTo(sessionId),
          messages: [...messages, { role: "user", content: "Stop calling tools. In one or two plain sentences, tell the user what you found or did, using only the tool results above. If you could not finish, say what is missing." }],
          tools: FOCUSED_TOOL_DECLARATIONS,
          maxTokens: 300,
          toolChoice: "none"
        });
        finalMessage = String(wrap.message?.content || "").trim();
      } catch {
        finalMessage = "";
      }
    }

    const totalDurationMs = Date.now() - sessionStartTime;
    await updateAgentSessionStatus(sessionId, "COMPLETED", {
      finalMessage: finalMessage || "Session completed successfully.",
      totalDurationMs
    });
    const finalTrajectory = await loadSessionTrajectory(sessionId);

    actionDispatcher.broadcast("AGENT_SESSION_COMPLETED", {
      sessionId,
      totalDurationMs,
      stepsCount: finalTrajectory?.steps?.length || 0,
      finalMessage
    });

    if (finalTrajectory) {
      dreamingEngine.reconcileSession(finalTrajectory).catch(() => {});
    }

    return {
      sessionId,
      success: true,
      status: "COMPLETED",
      model: this.model,
      totalDurationMs,
      trajectory: finalTrajectory,
      steps: finalTrajectory?.steps || [],
      finalMessage
    };

  }

  // Loads the focused prompt and tool schemas into the model's cache so the first real request is fast.
  async warmUp() {
    const messages = this.buildFocusedMessages("hello", {});
    await modelClient.callChat({ messages, tools: FOCUSED_TOOL_DECLARATIONS, maxTokens: 16 });
  }

  // Text reaches the browser while the model is still writing. A new model call resets the draft.
  streamTo(sessionId) {
    if (!focusedSessions.has(sessionId)) return null;
    actionDispatcher.broadcast("AGENT_TEXT_DELTA", { sessionId, reset: true, text: "" });
    return (text) => actionDispatcher.broadcast("AGENT_TEXT_DELTA", { sessionId, text });
  }

  async callModelWithTools(messages, sessionId, forceTool = null) {
    const res = await modelClient.callChat({
      sessionKey: sessionId,
      onText: this.streamTo(sessionId),
      messages,
      tools: focusedSessions.has(sessionId) ? FOCUSED_TOOL_DECLARATIONS : WHOLESHARE_TOOL_DECLARATIONS,
      maxTokens: focusedSessions.has(sessionId) ? (Number(process.env.MOSAIC_MAX_TOKENS) || (mosaicProvider() === "local" ? 400 : 1200)) : undefined,
      toolChoice: forceTool === "none" ? "none" : forceTool ? { type: "function", function: { name: forceTool } } : "auto"
    });
    return {
      message: res.message
    };
  }

}

export const durableHarness = new WholeshareDurableHarness();


// What each focused tool does to the world. A model never sees this, a person integrating a model does.
const TOOL_EFFECT = {
  ui_navigate_view: "ui", ui_filter_clans: "ui", ui_open_group: "ui", ui_open_my_group: "ui", ui_open_report: "ui", ui_open_slide_over: "ui", ui_export_snapshot: "ui",
  present: "ui", start_group_buy: "ui", open_paypal_dashboard: "external",
  kernel_research_web_fact: "external", kernel_read_supplier_site: "external", track_shipment: "external", find_suppliers: "external",
  query_escrow_ledger: "read", get_clan_constitution: "read", explain_escrow_document: "read", prepare_pledge_quote: "read",
  setup_profile: "write", send_invoice_reminder: "external", page_tool: "ui", query: "read", resolve: "read", compare_groups: "read", join_group: "read",
  schedule_move_delivery: "write", schedule_extend_inspection: "write", schedule_book_slot: "write", schedule_resolve_conflicts: "write", schedule_undo: "write", file_damage_claim: "write"
};

// What a connected outside agent may use: the data, planning and preparation tools. Nothing that only drives this browser's screen,
// and nothing that moves money. A pledge ends as a PayPal approval that a person gives on PayPal.
const SCREEN_ONLY_TOOLS = new Set(["ui_navigate_view", "present", "page_tool", "ui_open_group", "ui_open_report", "ui_open_my_group"]);
export const EXTERNAL_TOOL_NAMES = new Set([...FOCUSED_TOOL_NAMES].filter((name) => !SCREEN_ONLY_TOOLS.has(name)));

export function describeExternalTools() {
  return describeHarness().filter((tool) => EXTERNAL_TOOL_NAMES.has(tool.name));
}

// Runs one tool for an outside agent under the same permission switches the person set in Settings.
export async function runExternalTool(name, args) {
  if (!EXTERNAL_TOOL_NAMES.has(name)) return { error: `'${name}' is not a tool this connection can use.` };
  const blocked = permissionBlock(name);
  if (blocked) return blocked;
  const clean = args && typeof args === "object" && !Array.isArray(args) ? { ...args } : {};
  delete clean.stepUpApproved;
  delete clean.sessionId;
  const interception = interceptToolExecution(name, clean);
  if (!interception.valid) return { error: interception.violations.join("; ") };
  return JSON.parse(capToolMessage(await executeTool(name, clean)));
}

export function describeHarness() {
  return FOCUSED_TOOL_DECLARATIONS.map((tool) => {
    const name = tool.function.name;
    return {
      name,
      description: tool.function.description,
      parameters: tool.function.parameters,
      effect: TOOL_EFFECT[name] ?? "read",
      permission: PERMISSION_FOR_TOOL[name]?.flag ?? null,
      permissionLabel: PERMISSION_FOR_TOOL[name]?.label ?? null
    };
  });
}
