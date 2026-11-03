import { WHOLESHARE_TOOL_DECLARATIONS, executeTool, parseToolCallsFromContent } from "./tool-registry.js";
import { actionDispatcher } from "./web-actions.js";
import { generateFeatureMapPromptContext } from "./feature-map.js";
import { modelClient } from "./model-client.js";
import { SERVING_TARGET } from "./serving-target.js";

const MAX_TURNS = 6;

export class WholeshareAgentHarness {
  constructor() {
    this.model = (modelClient.preferLocal || !modelClient.openRouterKey)
      ? SERVING_TARGET.mlxId
      : "nvidia/nemotron-3.5-super-vl:free";
  }

  async runSession(options) {
    const opts = typeof options === "string" ? { prompt: options } : (options || {});
    const prompt = opts.prompt || "Reflect ledger state and evaluate active coalitions.";
    const sessionId = opts.sessionId || `sess_${Date.now()}`;
    const sessionStartTime = Date.now();
    const steps = [];

    const featureContext = generateFeatureMapPromptContext();

    const messages = [
      {
        role: "system",
        content: `You are the autonomous procurement agent for Wholeshare, a B2B group purchasing platform on PayPal.
Follow this operational protocol for sourcing, verification, and escrow:
1. REAL-TIME FACTS, SUPPLIERS, & REGULATORY RESEARCH: When real-time or external facts are needed from the web (supplier pricing, regulatory status, corporate KYC, forex spot rates, sanctions screening, or technical specs), use Kernel cloud browsers:
   - For live facts, forex rates, corporate registry checks, or compliance verification: use kernel_research_web_fact with intent, targetUrl, and query.
   - For distributor volume pricing tiers: use discover_wholesale_supplier_tiers with sku and vendorUrl.
   - For custom Playwright DOM automation: use kernel_execute_browser_task with targetUrl and script.
2. SUPPLIER CREDIBILITY & SECURITY VETTING: Before pledging or escrowing funds with a new external vendor, use verify_supplier_credibility with targetUrl to audit SSL encryption, physical business identity, domain trust, and scam indicators. Refuse vendors flagged as suspicious or wire-only.
3. CROSS-AGENT HYPERLINK & PROPOSAL FACT-CHECKING: When collaborating with other SME agents, never accept claimed prices or terms blindly. Use verify_external_agent_proposal with agentId, targetUrl, and claimedUnitPriceCents to verify the hyperlinked catalog live via Kernel cloud browsing. Flag price discrepancies before approving coalition holds.
4. INTERNAL CATALOG: When querying Wholeshare's own existing catalog without an external supplier URL, use discover_wholesale_catalog with sku.
5. ZERO SIMULATION MANDATE: Never estimate, fabricate, or hallucinate pricing brackets, forex rates, or KYC clearances if web extraction fails or data is missing. Explain the failure honestly and request authentic documents or URLs.
6. FINANCIAL CONSERVATION: All financial operations must use exact integer cents and intent: "AUTHORIZE". Direct CAPTURE is prohibited.
7. COMPLETION: When the requested actions have been executed, do not call redundant tools; return a concise text message to finish.

${featureContext}`
      },
      {
        role: "user",
        content: prompt
      }
    ];

    actionDispatcher.broadcast("AGENT_SESSION_STARTED", {
      sessionId,
      prompt,
      model: this.model,
      timestamp: new Date().toISOString()
    });

    let turn = 0;
    let finalMessage = "";

    while (turn < MAX_TURNS) {
      turn++;
      const stepStartTime = Date.now();

      try {
        const response = await this.callModelWithTools(messages);
        const durationMs = Date.now() - stepStartTime;

        const assistantMessage = response.message || {};
        const thinking = assistantMessage.thinking || "";
        const content = assistantMessage.content || "";
        let toolCalls = assistantMessage.tool_calls || [];
        if (toolCalls.length === 0 && content) {
          toolCalls = parseToolCallsFromContent(content);
        }

        if (thinking) {
          actionDispatcher.broadcast("AGENT_THOUGHT", {
            sessionId,
            stepIndex: turn,
            thought: thinking.substring(0, 300)
          });
        }

        if (toolCalls.length === 0) {
          finalMessage = content || "Operation completed successfully.";
          steps.push({
            stepIndex: turn,
            thought: thinking,
            response: finalMessage,
            durationMs
          });
          break;
        }

        for (const call of toolCalls) {
          const toolName = call.function?.name || call.name;
          let toolArgs = call.function?.arguments || call.arguments || {};
          if (typeof toolArgs === "string") {
            try {
              toolArgs = JSON.parse(toolArgs);
            } catch {
              // Leave as string if not JSON
            }
          }

          actionDispatcher.broadcast("AGENT_TOOL_CALL", {
            sessionId,
            stepIndex: turn,
            toolName,
            args: toolArgs
          });

          const toolResult = await executeTool(toolName, toolArgs);

          actionDispatcher.broadcast("AGENT_TOOL_RESULT", {
            sessionId,
            stepIndex: turn,
            toolName,
            result: toolResult
          });

          steps.push({
            stepIndex: turn,
            thought: thinking,
            toolCall: { name: toolName, arguments: toolArgs },
            toolResult,
            durationMs: Date.now() - stepStartTime
          });

          messages.push({
            role: "assistant",
            content: content || "",
            tool_calls: [call]
          });

          messages.push({
            role: "tool",
            tool_call_id: call.id || `call_${Date.now()}`,
            content: JSON.stringify(toolResult)
          });
        }
      } catch (err) {
        actionDispatcher.broadcast("AGENT_FAILURE", {
          sessionId,
          error: `REAL_LLM_FAILURE: ${err.message}`,
          timestamp: new Date().toISOString()
        });
        throw new Error(`Agent execution failed at model level: ${err.message}`);
      }
    }

    const totalDurationMs = Date.now() - sessionStartTime;

    actionDispatcher.broadcast("AGENT_SESSION_COMPLETED", {
      sessionId,
      totalDurationMs,
      stepsCount: steps.length,
      finalMessage
    });

    return {
      sessionId,
      success: true,
      model: this.model,
      totalDurationMs,
      steps,
      finalMessage
    };
  }

  async callModelWithTools(messages) {
    const res = await modelClient.callChat({
      messages,
      tools: WHOLESHARE_TOOL_DECLARATIONS
    });
    return {
      message: res.message
    };
  }

}

export const agentHarness = new WholeshareAgentHarness();
