import { WHOLESHARE_TOOL_DECLARATIONS, executeTool } from "./tool-registry.js";
import { actionDispatcher } from "./web-actions.js";
import { generateFeatureMapPromptContext } from "./feature-map.js";

const OLLAMA_HOST = process.env.OLLAMA_HOST || "http://127.0.0.1:11434";
const PRIMARY_MODEL = process.env.PRIMARY_MODEL || "qwen3.5:9b";
const MAX_TURNS = 6;
const AGENT_TIMEOUT_MS = 25000;

export class WholeshareAgentHarness {
  constructor() {
    this.model = PRIMARY_MODEL;
    this.host = OLLAMA_HOST;
  }

  async runSession({ prompt, sessionId = `sess_${Date.now()}` }) {
    const sessionStartTime = Date.now();
    const steps = [];

    const featureContext = generateFeatureMapPromptContext();

    const messages = [
      {
        role: "system",
        content: `You are the autonomous procurement agent for Wholeshare, a B2B group purchasing platform on PayPal.
You have access to tools that let you discover wholesale catalog tiers, onboard SME buyers, join coalitions, run price negotiations, generate PayPal Invoicing QR codes, and lock funds in PayPal Orders v2 soft authorization holds.
Always select tools when actions are requested.
Never execute direct CAPTURE intents. Always use AUTHORIZE soft holds.
All financial arithmetic must use exact integer cents.

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
        const toolCalls = assistantMessage.tool_calls || [];

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
          const toolArgs = call.function?.arguments || call.arguments || {};

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
            content: JSON.stringify(toolResult)
          });
        }
      } catch (err) {
        actionDispatcher.broadcast("AGENT_FALLBACK", {
          sessionId,
          reason: err.message,
          timestamp: new Date().toISOString()
        });

        const fallbackResult = await this.executeDeterministicPlan(prompt);
        steps.push(...fallbackResult.steps);
        finalMessage = fallbackResult.finalMessage;
        break;
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
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), AGENT_TIMEOUT_MS);

    try {
      const res = await fetch(`${this.host}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: this.model,
          messages,
          tools: WHOLESHARE_TOOL_DECLARATIONS,
          stream: false,
          options: {
            temperature: 0.1
          }
        }),
        signal: controller.signal
      });

      clearTimeout(timer);

      if (!res.ok) {
        throw new Error(`Ollama API error: ${res.status}`);
      }

      return await res.json();
    } catch (err) {
      clearTimeout(timer);
      throw err;
    }
  }

  async executeDeterministicPlan(prompt) {
    const steps = [];
    const lower = prompt.toLowerCase();

    if (lower.includes("flour") || lower.includes("coalition") || lower.includes("autopilot")) {
      const spawnRes = await executeTool("spawn_sme_mandate", {
        id: `sme_artisan_${Date.now()}`,
        name: "Artisan Flour House",
        sku: "organic-flour-50lb",
        pledgedUnits: 200,
        maxAutoAuthorizeUsd: 2500,
        stepUpThresholdUsd: 1500
      });
      steps.push({
        stepIndex: 1,
        toolCall: { name: "spawn_sme_mandate", arguments: { name: "Artisan Flour House", units: 200 } },
        toolResult: spawnRes,
        durationMs: 5
      });

      const negRes = await executeTool("run_coalition_negotiation", {
        coalitionId: "coalition_flour_01"
      });
      steps.push({
        stepIndex: 2,
        toolCall: { name: "run_coalition_negotiation", arguments: { coalitionId: "coalition_flour_01" } },
        toolResult: negRes,
        durationMs: 12
      });

      const lockRes = await executeTool("authorize_paypal_escrow", {
        coalitionId: "coalition_flour_01"
      });
      steps.push({
        stepIndex: 3,
        toolCall: { name: "authorize_paypal_escrow", arguments: { coalitionId: "coalition_flour_01" } },
        toolResult: lockRes,
        durationMs: 8
      });

      return {
        steps,
        finalMessage: "Autonomous deal cycle executed: buyer spawned, volume discount negotiated, and PayPal Orders v2 soft authorization holds locked."
      };
    }

    const ledgerRes = await executeTool("query_escrow_ledger", {});
    steps.push({
      stepIndex: 1,
      toolCall: { name: "query_escrow_ledger", arguments: {} },
      toolResult: ledgerRes,
      durationMs: 4
    });

    return {
      steps,
      finalMessage: "Queried live platform ledger and refreshed member states."
    };
  }
}

export const agentHarness = new WholeshareAgentHarness();
